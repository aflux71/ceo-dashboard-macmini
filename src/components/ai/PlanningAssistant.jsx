import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, X, Send, Loader2, ChevronDown, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";

const ALLOWED_ROLES = ["admin", "owner", "production_lead"];

// Summarize demand data for the AI prompt (top 30 items by urgency/need)
function buildContext(demandSummaries, forecastSuggestions, inventory) {
  const topDemand = (demandSummaries || [])
    .sort((a, b) => (b.avgMonthly || 0) - (a.avgMonthly || 0))
    .slice(0, 30)
    .map((s) => ({
      sku: s.sku,
      product: s.product,
      avgMonthly: s.avgMonthly,
      totalQty: s.totalQty,
      dataMonths: s.dataMonths,
    }));

  const criticalItems = (forecastSuggestions || [])
    .filter((f) => f.urgency === "critical" || f.urgency === "soon")
    .slice(0, 20)
    .map((f) => ({
      sku: f.sku,
      product: f.product_name,
      urgency: f.urgency,
      suggested_qty: f.suggested_qty,
      on_hand: f.on_hand,
      status: f.status,
    }));

  const lowStock = Object.entries(inventory || {})
    .filter(([, qty]) => qty < 100)
    .slice(0, 20)
    .map(([sku, qty]) => ({ sku, qty }));

  return { topDemand, criticalItems, lowStock };
}

export default function PlanningAssistant({ demandSummaries = [], forecastSuggestions = [], inventory = {} }) {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (open && !minimized) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, minimized]);

  // Role check
  if (!user) return null;
  if (!ALLOWED_ROLES.includes(user.role)) return null;

  const context = buildContext(demandSummaries, forecastSuggestions, inventory);

  const systemPrompt = `You are a smart production planning assistant for neōb, a cosmetics/beauty products manufacturer.
You have access to the following live data:

TOP 30 SKUs BY AVG MONTHLY DEMAND:
${JSON.stringify(context.topDemand, null, 2)}

CRITICAL/SOON FORECAST ITEMS (pending production decisions):
${JSON.stringify(context.criticalItems, null, 2)}

LOW STOCK ITEMS (under 100 units on hand):
${JSON.stringify(context.lowStock, null, 2)}

Your job is to help ${user.full_name || user.email} (role: ${user.role}) with:
- Production prioritization (what to make first)
- Demand forecasting insights (trends, seasonality)
- Inventory risk identification (what might run out)
- Purchase planning (what to reorder)
- Scheduling recommendations

Be concise, data-driven, and actionable. Use bullet points and markdown formatting.
Today's date: ${new Date().toLocaleDateString("en-CA")}.`;

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    // Build conversation prompt
    const conversationHistory = newMessages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    const fullPrompt = `${systemPrompt}\n\n--- CONVERSATION ---\n${conversationHistory}\n\nAssistant:`;

    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: fullPrompt,
        model: "gpt_5_mini",
      });
      setMessages((prev) => [...prev, { role: "assistant", content: res }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again." },
      ]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const QUICK_PROMPTS = [
    "What should I produce first this week?",
    "Which SKUs are at risk of stockout?",
    "Summarize current demand trends",
  ];

  return (
    <>
      {/* Floating Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-full shadow-2xl transition-all duration-200 hover:scale-105"
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-semibold">AI Planner</span>
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex flex-col bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl transition-all duration-200 ${
            minimized ? "w-72 h-14" : "w-96 h-[560px]"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0 rounded-t-2xl bg-zinc-900">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-100">AI Planning Assistant</p>
                {!minimized && <p className="text-[10px] text-zinc-500">Powered by GPT-4o mini</p>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMinimized(!minimized)}
                className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${minimized ? "rotate-180" : ""}`} />
              </button>
              <button
                onClick={() => { setOpen(false); setMinimized(false); }}
                className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-3.5 h-3.5 text-orange-400" />
                      </div>
                      <div className="bg-zinc-800 rounded-2xl rounded-tl-sm px-3 py-2.5 text-sm text-zinc-200 max-w-[80%]">
                        Hi {user.full_name?.split(" ")[0] || "there"}! I have access to your demand data, forecast suggestions, and inventory levels. How can I help you plan today?
                      </div>
                    </div>
                    <div className="space-y-2 pl-8">
                      {QUICK_PROMPTS.map((p) => (
                        <button
                          key={p}
                          onClick={() => { setInput(p); }}
                          className="block w-full text-left text-xs text-zinc-400 hover:text-orange-400 border border-zinc-700 hover:border-orange-500/40 rounded-xl px-3 py-2 transition-colors"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-3.5 h-3.5 text-orange-400" />
                      </div>
                    )}
                    <div
                      className={`rounded-2xl px-3 py-2.5 text-sm max-w-[82%] ${
                        msg.role === "user"
                          ? "bg-orange-500/20 text-orange-100 rounded-tr-sm"
                          : "bg-zinc-800 text-zinc-200 rounded-tl-sm"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <ReactMarkdown
                          className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&>ul]:my-1 [&>ol]:my-1 [&>p]:my-1"
                        >
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
                      <Bot className="w-3.5 h-3.5 text-orange-400" />
                    </div>
                    <div className="bg-zinc-800 rounded-2xl rounded-tl-sm px-3 py-2.5">
                      <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="p-3 border-t border-zinc-800 shrink-0">
                {messages.length > 0 && (
                  <button
                    onClick={() => setMessages([])}
                    className="text-[10px] text-zinc-600 hover:text-zinc-400 mb-2 transition-colors"
                  >
                    Clear conversation
                  </button>
                )}
                <div className="flex items-end gap-2">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about production priorities, demand trends..."
                    rows={2}
                    className="flex-1 bg-zinc-800 border-zinc-700 text-zinc-100 text-sm resize-none placeholder:text-zinc-600 rounded-xl"
                  />
                  <Button
                    size="icon"
                    onClick={sendMessage}
                    disabled={!input.trim() || loading}
                    className="bg-orange-500 hover:bg-orange-600 text-white h-10 w-10 shrink-0 rounded-xl"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-zinc-600 mt-1.5 text-center">
                  Uses live demand, forecast & inventory data · Admin/Lead only
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}