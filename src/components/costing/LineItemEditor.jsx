import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

/**
 * Generic editable line-item table.
 * fields = [{ key, label, type, placeholder, width }]
 */
export default function LineItemEditor({ title, items = [], fields, onChange, addLabel = "Add Row" }) {
  const update = (idx, key, value) => {
    const next = [...items];
    next[idx] = { ...next[idx], [key]: value };
    onChange(next);
  };
  const remove = (idx) => {
    const next = items.filter((_, i) => i !== idx);
    onChange(next);
  };
  const add = () => {
    const blank = fields.reduce((o, f) => ({ ...o, [f.key]: "" }), {});
    onChange([...items, blank]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-200">{title}</h4>
        <Button type="button" size="sm" variant="outline" onClick={add} className="h-7">
          <Plus className="w-3.5 h-3.5 mr-1" />
          {addLabel}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-500 italic">No rows yet.</p>
      ) : (
        <div className="space-y-1.5">
          <div className="hidden md:grid gap-2 text-xs text-zinc-500 px-1" style={{ gridTemplateColumns: fields.map(f => f.width || "1fr").join(" ") + " 32px" }}>
            {fields.map((f) => <div key={f.key}>{f.label}</div>)}
            <div />
          </div>
          {items.map((it, idx) => (
            <div
              key={idx}
              className="grid gap-2 items-center"
              style={{ gridTemplateColumns: fields.map(f => f.width || "1fr").join(" ") + " 32px" }}
            >
              {fields.map((f) => (
                <Input
                  key={f.key}
                  type={f.type || "text"}
                  step={f.type === "number" ? "any" : undefined}
                  placeholder={f.placeholder || f.label}
                  value={it[f.key] ?? ""}
                  onChange={(e) =>
                    update(
                      idx,
                      f.key,
                      f.type === "number"
                        ? e.target.value === "" ? "" : Number(e.target.value)
                        : e.target.value
                    )
                  }
                  className="bg-zinc-950 border-zinc-800 h-8 text-sm"
                />
              ))}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => remove(idx)}
                className="h-8 w-8 text-zinc-500 hover:text-red-400"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}