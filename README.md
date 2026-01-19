# VisionViz - Educational Visualizer

VisionViz is a Next.js application that uses AI and Augmented Reality concepts to visualize textbook text in 3D or 2D.

## Setup Instructions

1.  **Clone the repository** and install dependencies:
    ```bash
    npm install
    ```

2.  **Environment Variables**:
    Create a `.env.local` file in the root directory:
    ```
    GEMINI_API_KEY=your_gemini_api_key_here
    ```

3.  **Run the Frontend**:
    ```bash
    npm run dev
    ```
    Open `http://localhost:3000`.

## Google Colab Backend (Headless Blender)

To enable 3D rendering, you must run the backend on Google Colab.

1.  Open [Google Colab](https://colab.research.google.com/).
2.  Create a new notebook.
3.  Paste the following code into a cell and run it:

```python
# 1. Install Dependencies
!apt-get install blender -y
!pip install fastapi uvicorn pyngrok nest_asyncio python-multipart

# 2. Create the FastAPI Server Script
code = """
import bpy
import os
import uuid
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.responses import FileResponse

app = FastAPI()

class RenderRequest(BaseModel):
    script: str

@app.post("/render")
async def render_3d(req: RenderRequest):
    try:
        # Reset Blender Scene
        bpy.ops.wm.read_factory_settings(use_empty=True)
        
        # Execute the generated script
        exec(req.script, {'bpy': bpy})
        
        # Export as GLB
        filename = f"{uuid.uuid4()}.glb"
        filepath = f"/content/{filename}"
        
        bpy.ops.export_scene.gltf(filepath=filepath)
        
        if not os.path.exists(filepath):
            raise HTTPException(status_code=500, detail="Export failed")
            
        return FileResponse(filepath, media_type="model/gltf-binary", filename=filename)

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

"""
with open("server.py", "w") as f:
    f.write(code)

# 3. Run the Server & Expose via Localtunnel (or Ngrok)
import nest_asyncio
import uvicorn
import subprocess
import threading
import time

nest_asyncio.apply()

# Start Uvicorn in a thread
def run_server():
    uvicorn.run("server:app", host="0.0.0.0", port=8000)

thread = threading.Thread(target=run_server)
thread.start()

# Use localtunnel to expose port 8000
print("Installing localtunnel...")
!npm install -g localtunnel

print("Starting localtunnel...")
# This will print a URL like https://lazy-cat-44.loca.lt
# COPY THIS URL into the VisionViz frontend "Colab Backend URL" input.
!lt --port 8000
```

4.  **Important**: When using `localtunnel`, it may ask for a password/IP confirmation on the first visit. You might need to open the generated URL in your browser once to bypass the warning page.
5.  Copy the generated `https://....loca.lt` URL.
6.  Paste it into the "Colab Backend URL" field in the VisionViz HUD.

## Usage

1.  Allow camera permissions.
2.  Point the camera at a textbook page.
3.  Wait for text blocks to be highlighted (Green boxes).
4.  Click a text block.
5.  Click "VISUALISE".
6.  The app will determine if it should be 3D or 2D and render it over the camera feed.
