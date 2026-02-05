import express from "express";

const app = express();
app.use(express.json());

const MODEL = "llama3.2";
const PORT = 5555;

app.get("/health", (_req, res) => {
  res.json({ service: "NanoBanana", model: MODEL, status: "ok" });
});

app.post("/chat", async (req, res) => {
  const { message, system } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });

  try {
    const resp = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        messages: [
          { role: "system", content: system || "You are NanoBanana, a helpful but concise AI assistant. Keep answers short." },
          { role: "user", content: message },
        ],
      }),
    });
    const data = await resp.json();
    res.json({
      service: "NanoBanana",
      model: MODEL,
      response: data.message?.content || "",
      usage: {
        prompt_tokens: data.prompt_eval_count || 0,
        completion_tokens: data.eval_count || 0,
      },
    });
  } catch (err: any) {
    res.status(502).json({ error: "Ollama unreachable", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`NanoBanana running on http://localhost:${PORT}`);
  console.log(`Model: ${MODEL}`);
  console.log(`POST /chat  { "message": "hello" }`);
  console.log(`GET  /health`);
});
