import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Link2, Search, Trash2, Pencil, Eye, EyeOff, RefreshCw, Lock } from "lucide-react";
import AddMiscProductDialog from "@/components/portal-admin/AddMiscProductDialog";
import LinkInventoryDialog from "@/components/portal-admin/LinkInventoryDialog";

export default function PortalAdminProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [miscOpen, setMiscOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [currentUser, setCurrentUser] = useState(undefined);

  const load = async () => {
    setLoading(true);
    const list = await base44.entities.PortalProduct.list("display_order", 1000);
    setProducts(list || []);
    setLoading(false);
  };

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => setCurrentUser(null));
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      (p.name || "").toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q)
    );
  }, [products, search]);

  const handleSaveMisc = async (data) => {
    if (editing) {
      await base44.entities.PortalProduct.update(editing.id, data);
    } else {
      await base44.entities.PortalProduct.create(data);
    }
    setMiscOpen(false);
    setEditing(null);
    load();
  };

  const handleLinkItems = async (inventoryItems) => {
    await Promise.all(inventoryItems.map((item) =>
      base44.entities.PortalProduct.create({
        name: item.name,
        sku: item.sku,
        category: item.material_type || "",
        image_url: item.component_photo || "",
        source: "inventory_linked",
        inventory_item_id: item.id,
        portal_hidden: false
      })
    ));
    setLinkOpen(false);
    load();
  };

  const toggleHidden = async (p) => {
    await base44.entities.PortalProduct.update(p.id, { portal_hidden: !p.portal_hidden });
    load();
  };

  const handleDelete = async (p) => {
    if (!confirm(`Delete "${p.name}" from portal catalog?`)) return;
    await base44.entities.PortalProduct.delete(p.id);
    load();
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkAction = async (action) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (action === "delete" && !confirm(`Delete ${ids.length} selected products?`)) return;

    await Promise.all(ids.map((id) => {
      if (action === "hide") return base44.entities.PortalProduct.update(id, { portal_hidden: true });
      if (action === "show") return base44.entities.PortalProduct.update(id, { portal_hidden: false });
      if (action === "delete") return base44.entities.PortalProduct.delete(id);
      return null;
    }));
    setSelected(new Set());
    load();
  };

  const existingInventoryIds = useMemo(
    () => products.filter((p) => p.inventory_item_id).map((p) => p.inventory_item_id),
    [products]
  );

  if (currentUser === undefined) return null;
  if (currentUser?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <Lock className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Admin Access Required</h2>
          <p className="text-zinc-400 text-sm">
            Portal Products management is restricted to administrators.
          </p>
        </div>
      </div>
    );
  }

  const handleSyncShopify = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      // Pull all finished_product inventory items that originated from Shopify
      const finished = await base44.entities.Inventory.filter(
        { type: "finished_product", active: true },
        "name",
        2000
      );
      const fromShopify = (finished || []).filter((i) => !!i.last_shopify_sync);

      const existingSet = new Set(existingInventoryIds);
      const existingSkuSet = new Set(products.map((p) => (p.sku || "").toLowerCase()));

      const toCreate = fromShopify.filter(
        (i) => !existingSet.has(i.id) && !existingSkuSet.has((i.sku || "").toLowerCase())
      );

      if (toCreate.length === 0) {
        setSyncMsg("All Shopify finished goods are already in the portal catalog.");
      } else {
        await Promise.all(
          toCreate.map((item) =>
            base44.entities.PortalProduct.create({
              name: item.name,
              sku: item.sku,
              category: item.material_type || "",
              image_url: item.component_photo || "",
              source: "inventory_linked",
              inventory_item_id: item.id,
              portal_hidden: false,
            })
          )
        );
        setSyncMsg(`Added ${toCreate.length} product${toCreate.length === 1 ? "" : "s"} from Shopify inventory.`);
      }
      await load();
    } catch (err) {
      setSyncMsg(`Sync failed: ${err.message || "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Portal Product Catalog</h1>
          <p className="text-zinc-400 text-sm mt-1">Manage products visible to store ordering portal</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSyncShopify} disabled={syncing} className="bg-orange-500 hover:bg-orange-600 text-white">
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync from Shopify Inventory"}
          </Button>
          <Button onClick={() => { setEditing(null); setMiscOpen(true); }} variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            <Plus className="w-4 h-4 mr-2" /> Add Misc Product
          </Button>
          <Button onClick={() => setLinkOpen(true)} variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            <Link2 className="w-4 h-4 mr-2" /> Link Inventory Item
          </Button>
        </div>
      </div>

      {syncMsg && (
        <div className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm rounded-lg px-4 py-2">
          {syncMsg}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-zinc-900 border-zinc-800 text-white"
        />
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2">
          <span className="text-sm text-zinc-300">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => bulkAction("hide")} className="border-zinc-700 bg-zinc-800 text-zinc-300">Hide</Button>
          <Button size="sm" variant="outline" onClick={() => bulkAction("show")} className="border-zinc-700 bg-zinc-800 text-zinc-300">Show</Button>
          <Button size="sm" variant="outline" onClick={() => bulkAction("delete")} className="border-red-900 bg-red-950 text-red-300">Delete</Button>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/60 text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left w-10"></th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-center">Visible</th>
              <th className="px-3 py-2 text-right">Order</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" className="px-3 py-8 text-center text-zinc-500">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan="8" className="px-3 py-8 text-center text-zinc-500">No products yet</td></tr>
            ) : filtered.map((p) => (
              <tr key={p.id} className="border-t border-zinc-800 hover:bg-zinc-800/30">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="accent-orange-500" />
                </td>
                <td className="px-3 py-2 text-white">
                  <div className="flex items-center gap-2">
                    {p.name}
                    {p.portal_hidden && <Badge variant="amber" className="text-[10px]">Hidden</Badge>}
                  </div>
                </td>
                <td className="px-3 py-2 text-zinc-400">{p.sku}</td>
                <td className="px-3 py-2 text-zinc-400">{p.category || "—"}</td>
                <td className="px-3 py-2">
                  <Badge variant={p.source === "inventory_linked" ? "blue" : "purple"} className="text-[10px]">
                    {p.source === "inventory_linked" ? "Inventory" : "Misc"}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-center">
                  <Switch checked={!p.portal_hidden} onCheckedChange={() => toggleHidden(p)} />
                </td>
                <td className="px-3 py-2 text-right text-zinc-400">{p.display_order ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setMiscOpen(true); }} className="h-7 w-7 text-zinc-400 hover:text-white">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(p)} className="h-7 w-7 text-zinc-400 hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddMiscProductDialog open={miscOpen} onOpenChange={(o) => { setMiscOpen(o); if (!o) setEditing(null); }} onSave={handleSaveMisc} editing={editing} />
      <LinkInventoryDialog open={linkOpen} onOpenChange={setLinkOpen} onLink={handleLinkItems} existingInventoryIds={existingInventoryIds} />
    </div>
  );
}