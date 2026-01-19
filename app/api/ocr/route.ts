import { NextRequest, NextResponse } from 'next/server';
import { OCRBlock } from '@/lib/types';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();

    if (!image) {
      return NextResponse.json({ error: 'Image data is required' }, { status: 400 });
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    // Prepare the image part (remove data:image/jpeg;base64, prefix if present)
    const base64Image = image.replace(/^data:image\/(png|jpeg|webp);base64,/, "");

    const prompt = `
      Analyze the provided image and detect all visible text blocks.
      Return a JSON object with a key "blocks" containing a list of detected text.
      Each item in the list must have:
      - "text": The content of the text.
      - "box_2d": A list of 4 integers [ymin, xmin, ymax, xmax] representing the bounding box in a 0-1000 scale.
      
      Do not include any markdown formatting. Just the raw JSON.
    `;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: base64Image
                }
              }
            ]
          }
        ],
        generationConfig: {
            response_mime_type: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini OCR Error:", errorText);
      // Try to parse the error for more details
      let errorMsg = 'Failed to process image';
      try {
          const errObj = JSON.parse(errorText);
          errorMsg = errObj.error?.message || errorMsg;
      } catch (e) {
          // ignore
      }
      return NextResponse.json({ error: errorMsg, details: errorText }, { status: 500 });
    }

    const data = await response.json();
    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!candidate) {
         return NextResponse.json({ blocks: [] });
    }

    let parsedData;
    try {
        parsedData = JSON.parse(candidate);
    } catch (e) {
        console.error("Failed to parse Gemini OCR JSON", candidate);
        return NextResponse.json({ error: 'Invalid JSON response' }, { status: 500 });
    }

    const blocks: OCRBlock[] = (parsedData.blocks || []).map((b: any) => {
        // Gemini returns [ymin, xmin, ymax, xmax] in 0-1000
        // We need to convert to normalized 0-1 for the frontend to scale
        const [ymin, xmin, ymax, xmax] = b.box_2d || [0,0,0,0];
        
        return {
            text: b.text,
            // We'll store normalized coords (0-1) in the bbox to make it resolution independent
            // Note: CameraFeed expects pixel coords, but we can handle that conversion there if we pass normalized.
            // However, to keep types consistent with previous implementation (which used absolute pixels from Tesseract),
            // we should probably signal that these are normalized or change the type.
            // For now, let's return normalized and let frontend scale.
            bbox: {
                y0: ymin / 1000,
                x0: xmin / 1000,
                y1: ymax / 1000,
                x1: xmax / 1000
            }
        };
    });

    return NextResponse.json({ blocks });

  } catch (error) {
    console.error("OCR Route Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
