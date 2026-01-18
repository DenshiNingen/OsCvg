# OsCvg Studio (Web)

This is the web-based interface for **OsCvg**. It is built with **Next.js** and features a **Python Serverless API** backend.

## 🚀 Features
- **Timeline-Based Arrangement**: Master scrubber and segment markers.
- **Playlist Management**: Drag-and-drop SVG reordering.
- **Live Preview**: Real-time X-Y oscilloscope trace deflection.
- **Export System**: Buffering-optimized WAV generation for long sets.

## 🛠 Local Development

### 1. Requirements
Ensure you have the Python dependencies installed:
```bash
pip install -r requirements.txt
```

### 2. Start the API Server
The web app expects the Python API at `localhost:5328`.
```bash
python dev_server.py
```

### 3. Start the Next.js Frontend
```bash
npm install
npm run dev
```
Studio will be live at [http://localhost:3000](http://localhost:3000).

## ☁️ Deployment
This sub-directory is a standalone **Vercel** target. 
When deploying, select this folder (`web/`) as the **Root Directory** in the Vercel dashboard.