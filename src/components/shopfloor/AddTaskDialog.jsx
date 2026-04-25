import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus } from "lucide-react";

const TASK_TYPES = ["cleaning", "setup", "maintenance", "break", "training", "administrative", "other"];

export default function AddTaskDialog({ open, onClose, onSave, defaultDate, isLoading }) {
  const [form, setForm] = useState({
    task_name: "",
    task_type: "cleaning",
    task_date: "",
    start_time: "",
    end_time: "",
    operator: "",
    production_line: "",
    notes: "",
    status: "planned",
  });

  useEffect(() => {
    if (open) {
      setForm((f) => ({ ...f, task_date: defaultDate || "" }));
    }
  }, [open, defaultDate]);

  const handleSave = () => {
    const payload = {
      ...form,
      production_line: form.production_line ? Number(form.production_line) : undefined,
    };
    onSave(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
        <DialogHeader>
          <DialogTitle>Add Floor Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Task Name *</Label>
            <Input
              value={form.task_name}
              onChange={(e) => setForm({ ...form, task_name: e.target.value })}
              placeholder="e.g. Clean Line 1"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Type *</Label>
              <Select value={form.task_type} onValueChange={(v) => setForm({ ...form, task_type: v })}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Date *</Label>
              <Input
                type="date"
                value={form.task_date}
                onChange={(e) => setForm({ ...form, task_date: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Start Time</Label>
              <Input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">End Time</Label>
              <Input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Operator</Label>
              <Input
                value={form.operator}
                onChange={(e) => setForm({ ...form, operator: e.target.value })}
                placeholder="Name or team"
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Line</Label>
              <Select value={String(form.production_line || "")} onValueChange={(v) => setForm({ ...form, production_line: v })}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Any</SelectItem>
                  <SelectItem value="1">Line 1</SelectItem>
                  <SelectItem value="2">Line 2</SelectItem>
                  <SelectItem value="3">Melter 1</SelectItem>
                  <SelectItem value="4">Melter 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="bg-zinc-800 border-zinc-700 text-zinc-100 resize-none text-sm"
              rows={2}
              placeholder="Optional notes..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-zinc-700">Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!form.task_name || !form.task_type || !form.task_date || isLoading}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Add Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}