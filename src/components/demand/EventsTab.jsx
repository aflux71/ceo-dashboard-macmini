import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Plus, Calendar, Trash2, Edit2, Check, X, Package, ChevronDown, ChevronUp,
} from "lucide-react";
import { EVENT_TYPE_LABELS, EVENT_STATUS_LABELS, formatNumber } from "@/lib/demandHelpers";

const EMPTY_EVENT = {
  name: "",
  type: "wholesale",
  dueDate: "",
  status: "planned",
  items: [],
  notes: "",
};

export default function EventsTab({ events, onAddEvent, onUpdateEvent, onDeleteEvent }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_EVENT });
  const [itemInput, setItemInput] = useState({ sku: "", product: "", qty: "" });
  const [expandedId, setExpandedId] = useState(null);

  const startEdit = (ev) => {
    setEditingId(ev.id);
    setForm({
      name: ev.name,
      type: ev.type,
      dueDate: ev.dueDate,
      status: ev.status,
      items: typeof ev.items === "string" ? JSON.parse(ev.items || "[]") : ev.items || [],
      notes: ev.notes || "",
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!form.name || !form.dueDate) return;
    const payload = {
      ...form,
      items: JSON.stringify(form.items),
    };
    if (editingId) {
      onUpdateEvent(editingId, payload);
    } else {
      onAddEvent(payload);
    }
    setForm({ ...EMPTY_EVENT });
    setEditingId(null);
    setShowForm(false);
  };

  const addItem = () => {
    if (!itemInput.sku || !itemInput.qty) return;
    setForm(f => ({
      ...f,
      items: [...f.items, { sku: itemInput.sku, product: itemInput.product, qty: Number(itemInput.qty) }],
    }));
    setItemInput({ sku: "", product: "", qty: "" });
  };

  const removeItem = (idx) => {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const statusColor = (s) => {
    if (s === "fulfilled") return "green";
    if (s === "confirmed") return "blue";
    return "amber";
  };

  const parseItems = (ev) => {
    return typeof ev.items === "string" ? JSON.parse(ev.items || "[]") : ev.items || [];
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-orange-400" />
          Demand Events
        </h3>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ ...EMPTY_EVENT }); }}
          className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Event
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-zinc-500 uppercase mb-1">Event Name</label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. LCBO PO #4521"
                  className="h-8 bg-zinc-800 border-zinc-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-500 uppercase mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-2 py-1.5"
                >
                  {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-zinc-500 uppercase mb-1">Due Date</label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="h-8 bg-zinc-800 border-zinc-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-500 uppercase mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-2 py-1.5"
                >
                  {Object.entries(EVENT_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-zinc-500 uppercase mb-1">Notes</label>
              <Input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
                className="h-8 bg-zinc-800 border-zinc-700 text-sm"
              />
            </div>

            {/* Items */}
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase mb-1">Items</label>
              <div className="flex gap-2 mb-2">
                <Input
                  value={itemInput.sku}
                  onChange={e => setItemInput(v => ({ ...v, sku: e.target.value }))}
                  placeholder="SKU"
                  className="w-24 h-8 bg-zinc-800 border-zinc-700 text-sm"
                />
                <Input
                  value={itemInput.product}
                  onChange={e => setItemInput(v => ({ ...v, product: e.target.value }))}
                  placeholder="Product name"
                  className="flex-1 h-8 bg-zinc-800 border-zinc-700 text-sm"
                />
                <Input
                  type="number"
                  value={itemInput.qty}
                  onChange={e => setItemInput(v => ({ ...v, qty: e.target.value }))}
                  placeholder="Qty"
                  className="w-20 h-8 bg-zinc-800 border-zinc-700 text-sm"
                />
                <button
                  onClick={addItem}
                  className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded transition-colors"
                >
                  Add
                </button>
              </div>
              {form.items.length > 0 && (
                <div className="space-y-1">
                  {form.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 rounded text-xs">
                      <span className="text-zinc-300">
                        <span className="font-mono text-zinc-500">SKU {item.sku}</span> — {item.product || "N/A"} — {formatNumber(item.qty)} units
                      </span>
                      <button onClick={() => removeItem(i)} className="text-zinc-500 hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                className="flex items-center gap-1 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded transition-colors"
              >
                <Check className="w-4 h-4" />
                {editingId ? "Update Event" : "Create Event"}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Event list */}
      {events.length === 0 && !showForm && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-8 text-center">
            <Calendar className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No events yet. Add POs, wholesale orders, or store openings.</p>
          </CardContent>
        </Card>
      )}

      {events.map(ev => {
        const items = parseItems(ev);
        const totalQty = items.reduce((s, i) => s + (i.qty || 0), 0);
        const isExpanded = expandedId === ev.id;

        return (
          <Card key={ev.id} className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : ev.id)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-medium text-zinc-200">{ev.name}</h4>
                    <Badge variant={statusColor(ev.status)} className="text-[10px]">
                      {EVENT_STATUS_LABELS[ev.status] || ev.status}
                    </Badge>
                    <Badge variant="default" className="text-[10px] bg-zinc-800">
                      {EVENT_TYPE_LABELS[ev.type] || ev.type}
                    </Badge>
                  </div>
                  <div className="flex gap-4 text-xs text-zinc-500">
                    <span>Due: {ev.dueDate}</span>
                    <span>{items.length} items</span>
                    <span>{formatNumber(totalQty)} units</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(ev)}
                    className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDeleteEvent(ev.id)}
                    className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : ev.id)}
                    className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-zinc-800">
                  {ev.notes && <p className="text-xs text-zinc-400 mb-2">{ev.notes}</p>}
                  <div className="space-y-1">
                    {items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 rounded text-xs">
                        <span className="text-zinc-300">
                          <span className="font-mono text-zinc-500">SKU {item.sku}</span>
                          {item.product && ` — ${item.product}`}
                        </span>
                        <span className="text-orange-400 font-medium">{formatNumber(item.qty)} units</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
