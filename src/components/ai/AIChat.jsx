import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Sparkles, User } from "lucide-react";
import ReactMarkdown from "react-markdown";

const QUICK_PROMPTS = [
  "What are my top 10 low-stock inventory items?",
  "Summarize current demand planner critical SKUs",
  "Which batches are pending QC right now?",
  "Show me label stock levels below reorder point",
  "What are the most ordered products in the last 3 months?",
];

export default function AIChat() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I can answer questions about your inventory, batches, demand, labels, and more. What would you like to know?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const buildContext = async () => {
    try {
      const [inventory, labels, batches, demandSummaries] = await Promise.all([
        base44.entities.Inventory.list('-updated_date', 50).catch(() => []),
        base44.entities.Label.list('-updated_date', 50).catch(() => []),
        base44.entities.Batch.filter({ status: { $in: ['pending_qc', 'started', 'on_hold'] } }).catch(() => []),
        base44.entities.DemandSummary.list('-updated_date', 30).catch(() => []),
      ]);

      return `
INVENTORY SNAPSHOT (top 50 by recent update):
${inventory.map(i => `- ${i.sku} | ${i.name} | qty: ${i.quantity} ${i.unit} | reorder at: ${i.reorder_point || 'N/A'}`).join('\n')}

LABEL STOCK (top 50):
${labels.map(l => `- ${l.sku} | ${l.name} | on hand: ${l.current_quantity} | reorder at: ${l.reorder_point}`).join('\n')}

ACTIVE BATCHES (pending QC / in progress):
${batches.map(b => `- ${b.batch_id} | ${b.product_name} | qty: ${b.quantity} | status: ${b.status}`).join('\n')}

TOP DEMAND SUMMARIES (avg monthly):
${demandSummaries.map(d => `- ${d.sku} | ${d.product} | avg/mo: ${d.avgMonthly} | total: ${d.totalQty}`).join('\n')}
      `.trim();
    } catch {
      return "Context unavailable.";
    }
  };

  const sendMessage = async (text) => {
    const userMsg = text || input.trim();
    if (!userMsg) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const context = await buildContext();
      const history = messages.slice(-8).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a smart assistant for a manufacturing company called neōb. You have access to live data from their app.

LIVE DATA CONTEXT:
${context}

CONVERSATION HISTORY:
${history}

User: ${userMsg}

Answer concisely and helpfully. Use bullet points and markdown formatting where useful. Reference specific SKUs, names, and numbers from the data.`,
      });
      setMessages(prev => [...prev, { role: "assistant", content: response }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I encountered an error. Please try again." }]);
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-[70vh]">
      {/* Messages */}
      <Card className="bg-zinc-900 border-zinc-800 flex-1 overflow-hidden flex flex-col">
        <CardContent className="p-4 flex-1 overflow-y-auto space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'bg-zinc-800 text-zinc-200'
              }`}>
                {msg.role === 'assistant'
                  ? <ReactMarkdown className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{msg.content}</ReactMarkdown>
                  : msg.content
                }
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-zinc-400" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-orange-400" />
              </div>
              <div className="bg-zinc-800 rounded-2xl px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </CardContent>
      </Card>

      {/* Quick prompts */}
      <div className="flex gap-2 mt-3 flex-wrap">
        {QUICK_PROMPTS.map((p, i) => (
          <button
            key={i}
            onClick={() => sendMessage(p)}
            disabled={loading}
            className="text-[11px] px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-full border border-zinc-700 transition-colors"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2 mt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Ask about inventory, demand, batches, labels..."
          className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-orange-500/50"
          disabled={loading}
        />
        <Button
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
          className="bg-orange-600 hover:bg-orange-500 text-white px-4"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}