import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MapPin, Plus, Search } from "lucide-react";
import FloorMapCanvas from "@/components/binmap/FloorMapCanvas";
import FloorMapManager from "@/components/binmap/FloorMapManager";
import BinDetailPanel from "@/components/binmap/BinDetailPanel";
import PickPackPanel from "@/components/binmap/PickPackPanel";

export default function BinMap() {
  const qc = useQueryClient();
  const [currentMapId, setCurrentMapId] = useState(null);
  const [selectedBinId, setSelectedBinId] = useState(null);
  const [search, setSearch] = useState("");
  const [localBins, setLocalBins] = useState({}); // optimistic position cache: { id: {x, y} }

  const { data: floorMaps = [] } = useQuery({
    queryKey: ["floor_maps"],
    queryFn: () => base44.entities.WarehouseFloorMap.list(),
  });

  const { data: bins = [] } = useQuery({
    queryKey: ["bin_locations"],
    queryFn: () => base44.entities.BinLocation.list(),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ["inventory_for_bins"],
    queryFn: () => base44.entities.Inventory.list(),
  });

  // Auto-select first map on load
  useEffect(() => {
    if (!currentMapId && floorMaps.length > 0) {
      const def = floorMaps.find(m => m.is_default) || floorMaps[0];
      setCurrentMapId(def.id);
    }
  }, [floorMaps, currentMapId]);

  const visibleBins = useMemo(() => {
    return bins
      .filter(b => b.floor_map_id === currentMapId)
      .map(b => localBins[b.id] ? { ...b, ...localBins[b.id] } : b);
  }, [bins, currentMapId, localBins]);

  const filteredInventory = useMemo(() => {
    if (!search) return inventory;
    const q = search.toLowerCase();
    return inventory.filter(i =>
      i.name?.toLowerCase().includes(q) ||
      i.sku?.toLowerCase().includes(q) ||
      i.location?.toLowerCase().includes(q)
    );
  }, [inventory, search]);

  const createMap = useMutation({
    mutationFn: (name) => base44.entities.WarehouseFloorMap.create({ name }),
    onSuccess: (m) => { qc.invalidateQueries({ queryKey: ["floor_maps"] }); setCurrentMapId(m.id); },
  });

  const updateMap = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WarehouseFloorMap.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["floor_maps"] }),
  });

  const deleteMap = useMutation({
    mutationFn: (id) => base44.entities.WarehouseFloorMap.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["floor_maps"] }); setCurrentMapId(null); },
  });

  const createBin = useMutation({
    mutationFn: (data) => base44.entities.BinLocation.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bin_locations"] }),
  });

  const updateBin = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BinLocation.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bin_locations"] }),
  });

  const deleteBin = useMutation({
    mutationFn: (id) => base44.entities.BinLocation.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bin_locations"] }); setSelectedBinId(null); },
  });

  const handleBinMove = (id, x, y, isDragging) => {
    if (isDragging) {
      setLocalBins(prev => ({ ...prev, [id]: { x, y } }));
    } else {
      // commit on mouse up
      const local = localBins[id];
      if (local) {
        updateBin.mutate({ id, data: { x: local.x, y: local.y } });
        setLocalBins(prev => { const n = { ...prev }; delete n[id]; return n; });
      }
    }
  };

  const handleAddBin = () => {
    if (!currentMapId) return;
    const name = prompt("Location ID (e.g. A1-01):");
    if (!name?.trim()) return;
    createBin.mutate({
      name: name.trim(),
      type: "bin",
      floor_map_id: currentMapId,
      x: 50, y: 50, width: 80, height: 60, color: "#f97316"
    });
  };

  const selectedBin = visibleBins.find(b => b.id === selectedBinId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <MapPin className="w-7 h-7 text-orange-400" />
            Bin & Rack Locations
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">Drag bins to position them on your floor map</p>
        </div>
        <Button onClick={handleAddBin} disabled={!currentMapId} className="bg-orange-500 hover:bg-orange-600">
          <Plus className="w-4 h-4 mr-2" /> Add Bin
        </Button>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4 space-y-4">
          <FloorMapManager
            floorMaps={floorMaps}
            currentMapId={currentMapId}
            onSelectMap={setCurrentMapId}
            onCreateMap={(name) => createMap.mutate(name)}
            onUpdateMap={(id, data) => updateMap.mutate({ id, data })}
            onDeleteMap={(id) => deleteMap.mutate(id)}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <FloorMapCanvas
            floorMap={floorMaps.find(m => m.id === currentMapId)}
            bins={visibleBins}
            onBinMove={handleBinMove}
            onBinClick={(b) => setSelectedBinId(b.id)}
            selectedBinId={selectedBinId}
          />
          <p className="text-xs text-zinc-500 mt-2">
            {visibleBins.length} bin{visibleBins.length === 1 ? "" : "s"} on this map. Click to edit, drag to move.
          </p>
        </div>

        <div className="space-y-4">
          <PickPackPanel inventory={inventory} bins={bins} />
          {selectedBin ? (
            <BinDetailPanel
              bin={selectedBin}
              inventoryItems={inventory}
              onUpdate={(data) => updateBin.mutate({ id: selectedBin.id, data })}
              onDelete={(id) => deleteBin.mutate(id)}
              onClose={() => setSelectedBinId(null)}
            />
          ) : (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-zinc-300 mb-3">Inventory Lookup</h3>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <Input
                    placeholder="Search items..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="max-h-96 overflow-y-auto space-y-1">
                  {filteredInventory.slice(0, 50).map(item => (
                    <div key={item.id} className="flex items-center gap-2 text-sm bg-zinc-800 rounded p-2">
                      {item.component_photo ? (
                        <img src={item.component_photo} alt="" className="w-10 h-10 object-cover rounded" />
                      ) : (
                        <div className="w-10 h-10 bg-zinc-700 rounded flex items-center justify-center text-zinc-500 text-xs">No img</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-zinc-200 truncate">{item.name}</p>
                        <p className="text-xs text-zinc-500 truncate">
                          {item.sku} · {item.location || "no location"}
                        </p>
                      </div>
                    </div>
                  ))}
                  {filteredInventory.length === 0 && (
                    <p className="text-xs text-zinc-500 text-center py-4">No items match</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}