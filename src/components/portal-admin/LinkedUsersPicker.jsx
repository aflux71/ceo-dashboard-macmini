import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { X, Search, UserPlus } from "lucide-react";

export default function LinkedUsersPicker({ value = [], onChange }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    base44.entities.User.list("-created_date", 500)
      .then((list) => setUsers(list || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  const selected = Array.isArray(value) ? value : [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => !selected.includes(u.email))
      .filter((u) => {
        if (!q) return true;
        return (
          (u.email || "").toLowerCase().includes(q) ||
          (u.full_name || "").toLowerCase().includes(q)
        );
      })
      .slice(0, 50);
  }, [users, search, selected]);

  const add = (email) => {
    if (!email || selected.includes(email)) return;
    onChange([...selected, email]);
    setSearch("");
  };

  const remove = (email) => {
    onChange(selected.filter((e) => e !== email));
  };

  const getName = (email) => {
    const u = users.find((x) => x.email === email);
    return u?.full_name || email;
  };

  return (
    <div>
      <Label className="text-zinc-300 mb-1.5 block">Linked Dashboard Users</Label>
      <p className="text-xs text-zinc-500 mb-2">
        Dashboard users who can place orders for this store account.
      </p>

      <div className="flex flex-wrap gap-2 mb-2">
        {selected.length === 0 ? (
          <span className="text-xs text-zinc-600">No users linked.</span>
        ) : (
          selected.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-full pl-3 pr-1 py-1 text-xs text-white"
            >
              <span className="font-medium">{getName(email)}</span>
              <span className="text-zinc-500">{email !== getName(email) ? `· ${email}` : ""}</span>
              <button
                type="button"
                onClick={() => remove(email)}
                className="w-5 h-5 rounded-full hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-red-400"
                title="Unlink"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={loading ? "Loading users..." : "Search dashboard users to link..."}
          className="pl-10 bg-zinc-800 border-zinc-700 text-white"
        />
      </div>

      {open && (search.trim() || filtered.length > 0) && (
        <div className="mt-1 max-h-48 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded-md">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-zinc-500">No matching users.</div>
          ) : (
            filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => add(u.email)}
                className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate">{u.full_name || u.email}</div>
                  <div className="text-xs text-zinc-500 truncate">{u.email}</div>
                </div>
                <UserPlus className="w-4 h-4 text-zinc-400 shrink-0 ml-2" />
              </button>
            ))
          )}
        </div>
      )}

      {open && (
        <div className="mt-1 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            className="text-xs text-zinc-500 hover:text-zinc-300 h-6"
          >
            Close
          </Button>
        </div>
      )}
    </div>
  );
}