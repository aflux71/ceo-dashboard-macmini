import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Store } from "lucide-react";

export default function StorePickerDialog({ open, onOpenChange, onSelect }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const [list, me] = await Promise.all([
          base44.entities.PortalAccount.filter({ is_active: true }, "store_name", 500),
          base44.auth.me().catch(() => null)
        ]);
        let result = list || [];
        if (me && me.role !== "admin") {
          const email = (me.email || "").toLowerCase();
          result = result.filter((a) =>
            (a.linked_user_emails || []).map((e) => (e || "").toLowerCase()).includes(email)
          );
        }
        setAccounts(result);
      } catch {
        setAccounts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) =>
      (a.store_name || "").toLowerCase().includes(q) ||
      (a.contact_name || "").toLowerCase().includes(q) ||
      (a.contact_email || "").toLowerCase().includes(q)
    );
  }, [accounts, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Store className="w-5 h-5 text-orange-400" /> Select Store
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            autoFocus
            placeholder="Search by store, contact, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-700 text-white"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto border border-zinc-800 rounded-lg divide-y divide-zinc-800">
          {loading ? (
            <div className="p-6 text-center text-zinc-500 text-sm">Loading stores...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-zinc-500 text-sm">No stores found.</div>
          ) : (
            filtered.map((a) => (
              <button
                key={a.id}
                onClick={() => onSelect(a)}
                className="w-full text-left px-4 py-3 hover:bg-zinc-800/60 transition-colors"
              >
                <div className="text-white font-medium">{a.store_name}</div>
                <div className="text-xs text-zinc-400">
                  {a.contact_name || "—"} {a.contact_email ? `· ${a.contact_email}` : ""}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}