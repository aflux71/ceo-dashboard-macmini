import * as React from "react";
import { format, parseISO } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import Badge from "@/components/ui/Badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ExternalLink } from "lucide-react";

const STATUS_COLORS = {
  draft: 'default',
  started: 'blue',
  on_hold: 'amber',
  pending_qc: 'purple',
  approved: 'green',
  added_to_inventory: 'green',
  rejected: 'red'
};

const STATUS_LABELS = {
  draft: 'Draft',
  started: 'Started',
  on_hold: 'On Hold',
  pending_qc: 'Pending QC',
  approved: 'Approved',
  added_to_inventory: 'In Inventory',
  rejected: 'Rejected'
};

export default function DrillDownModal({ data, onClose }) {
  if (!data) return null;

  const { type, data: batches, title } = data;

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      return format(parseISO(dateStr), 'MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  return (
    <Dialog open={!!data} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">{title}</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-[500px] pr-4">
          {batches && batches.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead className="text-zinc-400">Batch ID</TableHead>
                  <TableHead className="text-zinc-400">Product</TableHead>
                  <TableHead className="text-zinc-400">Quantity</TableHead>
                  <TableHead className="text-zinc-400">Line</TableHead>
                  <TableHead className="text-zinc-400">Date</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400">Operator</TableHead>
                  {type === 'bottleneck' && (
                    <TableHead className="text-zinc-400">Hold Reason</TableHead>
                  )}
                  <TableHead className="text-zinc-400"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch, idx) => (
                  <TableRow key={batch.id || idx} className="border-zinc-800 hover:bg-zinc-800/50">
                    <TableCell className="font-mono text-orange-400">{batch.batch_id}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-zinc-200">{batch.product_name}</p>
                        <p className="text-xs text-zinc-500">{batch.sku}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-zinc-200">{batch.quantity?.toLocaleString()}</TableCell>
                    <TableCell className="text-zinc-200">Line {batch.production_line || 1}</TableCell>
                    <TableCell className="text-zinc-400">{formatDate(batch.production_date)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_COLORS[batch.status] || 'default'}>
                        {STATUS_LABELS[batch.status] || batch.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-400">{batch.operator || '-'}</TableCell>
                    {type === 'bottleneck' && (
                      <TableCell className="text-zinc-400 max-w-[150px] truncate">
                        {batch.hold_reason || '-'}
                      </TableCell>
                    )}
                    <TableCell>
                      <Link 
                        to={createPageUrl('BatchHistory') + `?search=${batch.batch_id}`}
                        className="text-orange-400 hover:text-orange-300"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex items-center justify-center h-32 text-zinc-500">
              No data available
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-between items-center pt-4 border-t border-zinc-800">
          <p className="text-sm text-zinc-500">
            {batches?.length || 0} batch{batches?.length !== 1 ? 'es' : ''} total
          </p>
          <p className="text-sm text-zinc-500">
            Total volume: {batches?.reduce((sum, b) => sum + (b.quantity || 0), 0).toLocaleString()} units
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}