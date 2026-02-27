import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Package } from "lucide-react";
import Badge from "@/components/ui/Badge";

export default function LotNumbersDialog({ open, onOpenChange, item, onSave }) {
  const [lots, setLots] = useState(item?.lot_numbers || []);
  const [newLot, setNewLot] = useState({ lot: "", quantity: 0, expiration_date: "", received_date: new Date().toISOString().split('T')[0] });

  React.useEffect(() => {
    if (open && item) {
      setLots(item.lot_numbers || []);
    }
  }, [open, item]);

  const addLot = () => {
    if (!newLot.lot || newLot.quantity <= 0) return;
    setLots([...lots, { ...newLot }]);
    setNewLot({ lot: "", quantity: 0, expiration_date: "", received_date: new Date().toISOString().split('T')[0] });
  };

  const removeLot = (index) => {
    setLots(lots.filter((_, i) => i !== index));
  };

  const updateLot = (index, field, value) => {
    const updated = [...lots];
    updated[index] = { ...updated[index], [field]: value };
    setLots(updated);
  };

  const handleSave = () => {
    // Calculate total quantity from lots
    const totalQty = lots.reduce((sum, l) => sum + (parseFloat(l.quantity) || 0), 0);
    onSave(lots, totalQty);
    onOpenChange(false);
  };

  const totalQty = lots.reduce((sum, l) => sum + (parseFloat(l.quantity) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-400" />
            Manage Lot Numbers - {item?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Lots */}
          <div className="space-y-2">
            <Label>Current Lots ({lots.length})</Label>
            {lots.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4 text-center">No lot numbers recorded</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                {lots.map((lot, idx) => (
                  <div key={idx} className="grid grid-cols-5 gap-2 items-center p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                    <div>
                      <Label className="text-xs text-zinc-500">Lot #</Label>
                      <Input
                        value={lot.lot}
                        onChange={(e) => updateLot(idx, 'lot', e.target.value)}
                        className="bg-zinc-800 border-zinc-700 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-500">Quantity</Label>
                      <Input
                        type="number"
                        value={lot.quantity}
                        onChange={(e) => updateLot(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        className="bg-zinc-800 border-zinc-700 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-500">Received</Label>
                      <Input
                        type="date"
                        value={lot.received_date || ''}
                        onChange={(e) => updateLot(idx, 'received_date', e.target.value)}
                        className="bg-zinc-800 border-zinc-700 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-500">Expires</Label>
                      <Input
                        type="date"
                        value={lot.expiration_date || ''}
                        onChange={(e) => updateLot(idx, 'expiration_date', e.target.value)}
                        className="bg-zinc-800 border-zinc-700 h-8 text-sm"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLot(idx)}
                        className="text-red-400 hover:text-red-300 h-8"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add New Lot */}
          <div className="border-t border-zinc-700 pt-4">
            <Label className="mb-2 block">Add New Lot</Label>
            <div className="grid grid-cols-5 gap-2 items-end">
              <div>
                <Label className="text-xs text-zinc-500">Lot #</Label>
                <Input
                  value={newLot.lot}
                  onChange={(e) => setNewLot({ ...newLot, lot: e.target.value })}
                  placeholder="LOT-001"
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div>
                <Label className="text-xs text-zinc-500">Quantity</Label>
                <Input
                  type="number"
                  value={newLot.quantity || ''}
                  onChange={(e) => setNewLot({ ...newLot, quantity: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div>
                <Label className="text-xs text-zinc-500">Received</Label>
                <Input
                  type="date"
                  value={newLot.received_date}
                  onChange={(e) => setNewLot({ ...newLot, received_date: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div>
                <Label className="text-xs text-zinc-500">Expires</Label>
                <Input
                  type="date"
                  value={newLot.expiration_date}
                  onChange={(e) => setNewLot({ ...newLot, expiration_date: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <Button
                type="button"
                onClick={addLot}
                disabled={!newLot.lot || newLot.quantity <= 0}
                className="bg-orange-500 hover:bg-orange-600"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-zinc-800/50 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-500">Total Quantity from Lots</p>
              <p className="text-2xl font-bold text-orange-400">{totalQty} <span className="text-sm text-zinc-500">{item?.unit}</span></p>
            </div>
            {totalQty !== (item?.quantity || 0) && (
              <Badge variant="amber">
                Differs from current: {item?.quantity} {item?.unit}
              </Badge>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} className="bg-orange-500 hover:bg-orange-600">
            Save Lots
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}