import React, { useState } from "react";
import { Plus, Trash2, Calendar, Store, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Badge from "@/components/ui/Badge";
import Papa from "papaparse";

export default function EventsManager({ events = [], onEventsChange, availableSkus = [] }) {
  const [showDialog, setShowDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [uploadingCSV, setUploadingCSV] = useState(false);
  const csvInputRef = React.useRef(null);
  const [eventForm, setEventForm] = useState({
    type: 'store_opening',
    name: '',
    stock_date: '',
    items: []
  });

  const openNewEvent = () => {
    setEditingEvent(null);
    setEventForm({
      type: 'store_opening',
      name: '',
      stock_date: '',
      items: []
    });
    setShowDialog(true);
  };

  const openEditEvent = (event) => {
    setEditingEvent(event);
    setEventForm({ ...event });
    setShowDialog(true);
  };

  const handleSave = () => {
    const newEvent = {
      ...eventForm,
      id: editingEvent?.id || Date.now().toString()
    };

    let updatedEvents;
    if (editingEvent) {
      updatedEvents = events.map(e => e.id === editingEvent.id ? newEvent : e);
    } else {
      updatedEvents = [...events, newEvent];
    }

    onEventsChange(updatedEvents);
    setShowDialog(false);
  };

  const handleDelete = (eventId) => {
    onEventsChange(events.filter(e => e.id !== eventId));
  };

  const addItem = () => {
    setEventForm({
      ...eventForm,
      items: [...eventForm.items, { sku: '', product: '', qty: 0 }]
    });
  };

  const updateItem = (idx, field, value) => {
    const updatedItems = [...eventForm.items];
    updatedItems[idx][field] = value;
    
    if (field === 'sku') {
      const skuInfo = availableSkus.find(s => s.sku === value);
      if (skuInfo) {
        updatedItems[idx].product = skuInfo.product || skuInfo.name;
      }
    }
    
    setEventForm({ ...eventForm, items: updatedItems });
  };

  const removeItem = (idx) => {
    setEventForm({
      ...eventForm,
      items: eventForm.items.filter((_, i) => i !== idx)
    });
  };

  const handleCSVUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingCSV(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: function(results) {
        if (!results.data || results.data.length === 0) {
          alert('CSV is empty');
          setUploadingCSV(false);
          return;
        }

        // Get all column names (case-insensitive lookup)
        const firstRow = results.data[0];
        const columns = Object.keys(firstRow).map(k => k.toLowerCase().trim());
        
        const findColumn = (aliases) => {
          const idx = columns.findIndex(col => aliases.some(alias => col.includes(alias)));
          return idx >= 0 ? Object.keys(firstRow)[idx] : null;
        };

        const skuCol = findColumn(['sku']);
        const productCol = findColumn(['product', 'title', 'name', 'item']);
        const qtyCol = findColumn(['qty', 'quantity', 'units', 'amount']);

        if (!skuCol || !qtyCol) {
          alert(`Could not find required columns. Found: ${columns.join(', ')}\n\nNeed at least: SKU and Qty/Quantity`);
          setUploadingCSV(false);
          return;
        }

        const items = results.data
          .filter(row => row && row[skuCol])
          .map(row => {
            const sku = (row[skuCol] || '').toString().trim();
            const product = productCol ? (row[productCol] || '').toString().trim() : '';
            const qty = parseInt(row[qtyCol] || 0);
            
            return { sku, product: product || sku, qty: isNaN(qty) ? 0 : qty };
          })
          .filter(item => item.sku && item.qty > 0);

        if (items.length === 0) {
          alert('No valid items found. Make sure SKU column has values and Qty > 0');
          setUploadingCSV(false);
          return;
        }

        setEventForm(prev => ({
          ...prev,
          items: [...prev.items, ...items]
        }));
        setUploadingCSV(false);
        
        if (csvInputRef.current) {
          csvInputRef.current.value = '';
        }
      },
      error: function(error) {
        alert('Error parsing CSV: ' + error.message);
        setUploadingCSV(false);
      }
    });
  };

  const totalEventQty = events.reduce((sum, e) => sum + (e.items || []).reduce((s, i) => s + (i.qty || 0), 0), 0);

  return (
    <div className="space-y-4">
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Demand Events
              </CardTitle>
              <p className="text-xs text-zinc-500 mt-1">
                {events.length} events • {totalEventQty.toLocaleString()} units
              </p>
            </div>
            <Button onClick={openNewEvent} size="sm" className="bg-orange-500 hover:bg-orange-600">
              <Plus className="w-4 h-4 mr-1" />
              Add Event
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No events added yet</p>
              <p className="text-xs mt-1">Add store openings or wholesale orders</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <div key={event.id} className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {event.type === 'store_opening' ? (
                        <Store className="w-4 h-4 text-purple-400" />
                      ) : (
                        <FileText className="w-4 h-4 text-blue-400" />
                      )}
                      <span className="font-medium text-zinc-200">{event.name}</span>
                      <Badge variant={event.type === 'store_opening' ? 'purple' : 'blue'}>
                        {event.type === 'store_opening' ? 'Store Opening' : 'Wholesale PO'}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditEvent(event)}
                        className="text-zinc-500 hover:text-zinc-300 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(event.id)}
                        className="text-zinc-500 hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500 mb-2">
                    Stock Date: {new Date(event.stock_date).toLocaleDateString()}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {event.items.length} SKUs • {event.items.reduce((sum, i) => sum + i.qty, 0)} total units
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Edit Event' : 'New Event'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Event Type</Label>
                <Select value={eventForm.type} onValueChange={(v) => setEventForm({...eventForm, type: v})}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store_opening">Store Opening</SelectItem>
                    <SelectItem value="wholesale_po">Wholesale PO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Stock Date</Label>
                <Input
                  type="date"
                  value={eventForm.stock_date}
                  onChange={(e) => setEventForm({...eventForm, stock_date: e.target.value})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Event Name</Label>
              <Input
                value={eventForm.name}
                onChange={(e) => setEventForm({...eventForm, name: e.target.value})}
                placeholder="e.g., FARM Store Opening, Indigo Wholesale Order"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Items</Label>
                <div className="flex gap-2">
                  <div>
                    <input
                      ref={csvInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleCSVUpload}
                      className="hidden"
                      disabled={uploadingCSV}
                    />
                    <Button type="button" size="sm" variant="outline" className="cursor-pointer" onClick={() => csvInputRef.current?.click()}>
                      <Upload className="w-3 h-3 mr-1" />
                      {uploadingCSV ? 'Processing...' : 'Upload P.O.'}
                    </Button>
                  </div>
                  <Button onClick={addItem} size="sm" variant="outline">
                    <Plus className="w-3 h-3 mr-1" />
                    Add SKU
                  </Button>
                  </div>
                  </div>
              
              {eventForm.items.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 border border-dashed border-zinc-700 rounded-lg">
                  No items added yet
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {eventForm.items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 p-2 bg-zinc-800/50 rounded border border-zinc-700">
                      <Input
                        placeholder="SKU"
                        value={item.sku}
                        onChange={(e) => updateItem(idx, 'sku', e.target.value)}
                        className="col-span-3 bg-zinc-800 border-zinc-700 text-sm"
                        list="sku-list"
                      />
                      <Input
                        placeholder="Product Name"
                        value={item.product}
                        onChange={(e) => updateItem(idx, 'product', e.target.value)}
                        className="col-span-5 bg-zinc-800 border-zinc-700 text-sm"
                      />
                      <Input
                        type="number"
                        placeholder="Qty"
                        value={item.qty || ''}
                        onChange={(e) => updateItem(idx, 'qty', parseInt(e.target.value) || 0)}
                        className="col-span-3 bg-zinc-800 border-zinc-700 text-sm"
                      />
                      <button
                        onClick={() => removeItem(idx)}
                        className="col-span-1 flex items-center justify-center text-zinc-500 hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <datalist id="sku-list">
            {availableSkus.map(s => (
              <option key={s.sku} value={s.sku}>{s.product || s.name}</option>
            ))}
          </datalist>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSave} 
              disabled={!eventForm.name || !eventForm.stock_date || eventForm.items.length === 0}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Save Event
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}