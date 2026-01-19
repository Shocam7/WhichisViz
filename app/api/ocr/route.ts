import { NextRequest, NextResponse } from 'next/server';
import { OCRBlock } from '@/lib/types';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Using v1beta is correct for 2.0-flash
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();

    if (!image) return NextResponse.json({ error: 'Image data required' }, { status: 400 });
    if (!GEMINI_API_KEY) return NextResponse.json({ error: 'API Key missing' }, { status: 500 });

    const base64Image = image.replace(/^data:image\/(png|jpeg|webp);base64,/, "");

    const prompt = `
      Detect all visible text blocks.
      Return a JSON object with a key "blocks".
      Each block: {"text": "string", "box_2d": [ymin, xmin, ymax, xmax]} 
      Scale: 0-1000.
    `;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: base64Image } }
          ]
        }],
        generationConfig: {
          response_mime_type: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      // LOG THIS: It will tell you if it's an API Key error, Rate Limit, or Model error
      console.error("Gemini API Refusal:", JSON.stringify(errorData, null, 2));
      return NextResponse.json({ error: errorData.error?.message || 'Gemini Refusal' }, { status: response.status });
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!candidateText) return NextResponse.json({ blocks: [] });

    const parsedData = JSON.parse(candidateText);

    // Map and Normalize (0-1000 to 0-1)
    const blocks: OCRBlock[] = (parsedData.blocks || []).map((b: any) => ({
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
    console.error("Internal Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
