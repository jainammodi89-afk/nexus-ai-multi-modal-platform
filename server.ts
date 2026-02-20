import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import Database from "better-sqlite3";

dotenv.config();

const app = express();
const PORT = 3000;
const db = new Database("experiments.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS experiments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    input_summary TEXT,
    output_json TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(express.json({ limit: '50mb' }));

// AI Service Helper
const getAI = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// API Routes
app.post("/api/predict/vision", async (req, res) => {
  try {
    const { image, prompt } = req.body;
    const ai = getAI();
    const model = "gemini-3-flash-preview";
    
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { data: image.split(',')[1], mimeType: "image/jpeg" } },
          { text: prompt || "Analyze this image. Detect objects and provide a detailed caption." }
        ]
      }
    });

    const result = response.text;
    db.prepare("INSERT INTO experiments (type, input_summary, output_json) VALUES (?, ?, ?)")
      .run("vision", "Image Analysis", JSON.stringify({ result }));

    res.json({ result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/predict/nlp", async (req, res) => {
  try {
    const { text, task } = req.body;
    const ai = getAI();
    const model = "gemini-3-flash-preview";

    const systemInstructions = {
      summarize: "Summarize the following text concisely.",
      classify: "Classify the topic and sentiment of the following text. Return as JSON.",
      analyze: "Perform a deep analysis of the following text, including key entities and tone."
    };

    const response = await ai.models.generateContent({
      model,
      contents: text,
      config: {
        systemInstruction: systemInstructions[task as keyof typeof systemInstructions] || systemInstructions.analyze
      }
    });

    const result = response.text;
    db.prepare("INSERT INTO experiments (type, input_summary, output_json) VALUES (?, ?, ?)")
      .run("nlp", text.substring(0, 50), JSON.stringify({ result }));

    res.json({ result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/experiments", (req, res) => {
  const experiments = db.prepare("SELECT * FROM experiments ORDER BY timestamp DESC LIMIT 10").all();
  res.json(experiments);
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Vite Integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Nexus AI Server running at http://localhost:${PORT}`);
  });
}

startServer();
