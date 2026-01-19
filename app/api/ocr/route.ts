import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Using v1beta is necessary for JSON mode features
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();

    if (!image) return NextResponse.json({ error: 'Image required' }, { status: 400 });
    if (!GEMINI_API_KEY) return NextResponse.json({ error: 'API Key missing' }, { status: 500 });

    const base64Image = image.replace(/^data:image\/(png|jpeg|webp);base64,/, "");

    const payload = {
      contents: [{
        parts: [
          { text: "Detect all text. Return JSON: { \"blocks\": [ { \"text\": \"string\", \"box_2d\": [ymin, xmin, ymax, xmax] } ] }. Scale 0-1000." },
          { 
            inline_data: { 
              mime_type: "image/jpeg", 
              data: base64Image 
            } 
          }
        ]
      }],
      generationConfig: {
        response_mime_type: "application/json",
      }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorMsg = await response.text();
      console.error("Gemini Error Detail:", errorMsg);
      return NextResponse.json({ error: "API Refusal" }, { status: response.status });
    }

    const data = await response.json();
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) return NextResponse.json({ blocks: [] });

    // Fallback: If the model still includes markdown triple backticks, strip them
    const cleanJson = rawText.replace(/```json|```/g, "").trim();
    const parsedData = JSON.parse(cleanJson);

    // Map to your frontend's expected format
    const blocks = (parsedData.blocks || []).map((b: any) => ({
      text: b.text,
      bbox: {
        y0: b.box_2d[0] / 1000,
        x0: b.box_2d[1] / 1000,
        y1: b.box_2d[2] / 1000,
        x1: b.box_2d[3] / 1000
      }
    }));

    return NextResponse.json({ blocks });

  } catch (error: any) {
    console.error("OCR Route Failure:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
