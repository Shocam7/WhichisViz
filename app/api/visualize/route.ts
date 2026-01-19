import { NextRequest, NextResponse } from 'next/server';
import { VisualizationResponse } from '@/lib/types';

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    // Prompt Engineering
    const systemPrompt = `
      You are an expert educational visualizer. Your goal is to convert textbook text into 3D or 2D visualizations.
      
      Input Text: "${text}"

      Decide whether to use a 3D model (Blender script) or a 2D animation (HTML Canvas/JS).
      
      Decision Logic:
      - Use "2D" for: Maps, troop movements, abstract concepts, simple diagrams, or scenarios with >50 entities.
      - Use "3D" for: Biological models (cells, organs), mechanical models (engines, gears), specific historical artifacts, or single complex objects.

      Output Format:
      Return ONLY a raw JSON object (no markdown formatting) with the following structure:
      {
        "type": "3D" | "2D",
        "reasoning": "Short explanation of your choice",
        "script": "The code string"
      }

      For "3D" type:
      - The 'script' must be a valid Python script for Blender.
      - It should delete all existing mesh objects first.
      - It should create the described 3D model using 'bpy'.
      - It should NOT render an image, just build the mesh.
      - Keep it relatively simple to ensure execution speed.

      For "2D" type:
      - The 'script' must be a valid JavaScript code block.
      - It will be executed inside a function that receives 'ctx' (CanvasRenderingContext2D), 'width' (number), 'height' (number), and 'frameCount' (number, incrementing per frame).
      - The code should draw a single frame of animation.
      - Do NOT declare the function, just write the body.
      - Example 2D script: "ctx.fillStyle = 'red'; ctx.fillRect(10 + frameCount, 10, 50, 50);"
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
              {
                text: systemPrompt
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error:", errorText);
      return NextResponse.json({ error: 'Failed to communicate with Gemini' }, { status: 500 });
    }

    const data = await response.json();
    
    // Extract text from Gemini response
    const candidates = data.candidates;
    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ error: 'No response from Gemini' }, { status: 500 });
    }

    let generatedText = candidates[0].content.parts[0].text;
    
    // Clean up potential Markdown code blocks
    generatedText = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();

    let result: VisualizationResponse;
    try {
      result = JSON.parse(generatedText);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError, "Text:", generatedText);
      return NextResponse.json({ error: 'Invalid JSON from Gemini', raw: generatedText }, { status: 500 });
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
