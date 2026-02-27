import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import Badge from "@/components/ui/Badge";
import { urgencyConfig } from "./ForecastResults";

export default function EventBreakdownTab({ results = [] }) {
  const [expandedSku, setExpandedSku] = useState(null);

  // Filter items with event demand
  const itemsWithEvents = results.filter(item => item.eventDemand > 0);

  if (itemsWithEvents.length === 0) {
    return (
      <Card className="bg-zinc-900 border-zinc-800 p-8">
        <p className="text-center text-zinc-500">No items with event demand</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-purple-950/20 border border-purple-800/30 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-purple-400 mb-2">
          📊 Event Breakdown
        </h3>
        <p className="text-xs text-zinc-400">
          Shows all items with event demand and their associated quantities
        </p>
      </div>

      <div className="overflow-x-auto bg-zinc-900 border border-zinc-800 rounded-lg">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-800/50">
              <th className="text-left p-3 text-[10px] font-semibold text-zinc-400 uppercase">SKU</th>
              <th className="text-left p-3 text-[10px] font-semibold text-zinc-400 uppercase">Product</th>
              <th className="text-left p-3 text-[10px] font-semibold text-zinc-400 uppercase">Event(s)</th>
              <th className="text-right p-3 text-[10px] font-semibold text-purple-400 uppercase bg-purple-950/20">Event Qty</th>
              <th className="text-right p-3 text-[10px] font-semibold text-zinc-400 uppercase">Forecast Qty</th>
              <th className="text-right p-3 text-[10px] font-semibold text-zinc-400 uppercase">Total Demand</th>
              <th className="text-right p-3 text-[10px] font-semibold text-zinc-400 uppercase">On Hand</th>
              <th className="text-right p-3 text-[10px] font-semibold text-orange-400 uppercase">Order Qty</th>
            </tr>
          </thead>
          <tbody>
            {itemsWithEvents.map((item) => (
              <React.Fragment key={item.sku}>
                <tr 
                  className="border-b border-zinc-800 hover:bg-zinc-800/30 cursor-pointer"
                  onClick={() => setExpandedSku(expandedSku === item.sku ? null : item.sku)}
                >
                  <td className="p-3 w-20">
                    <span className="font-mono text-orange-400 font-semibold">{item.sku}</span>
                  </td>
                  <td className="p-3 text-zinc-200 w-48">{item.product}</td>
                  <td className="p-3 text-zinc-300">
                    {item.eventDetails?.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.eventDetails.slice(0, 2).map((event, idx) => (
                          <span key={idx} className="text-xs text-blue-400">
                            {event.eventName}
                            {item.eventDetails.length > 2 && idx === 1 ? ` +${item.eventDetails.length - 2}` : ''}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-zinc-600">-</span>
                    )}
                  </td>
                  <td className="p-3 text-right bg-purple-950/10 text-purple-400 font-semibold">
                    +{item.eventDemand}
                  </td>
                  <td className="p-3 text-right text-zinc-200">
                    {item.forecastTotal}
                  </td>
                  <td className="p-3 text-right text-zinc-100 font-semibold">
                    {item.forecastTotal + item.eventDemand}
                  </td>
                  <td className="p-3 text-right text-zinc-200">
                    {item.onHand}
                  </td>
                  <td className="p-3 text-right bg-orange-950/10 text-orange-400 font-bold">
                    {item.orderQty}
                  </td>
                </tr>
                
                {expandedSku === item.sku && item.eventDetails?.length > 0 && (
                  <tr className="bg-zinc-800/20 border-b border-zinc-800">
                    <td colSpan={8} className="p-4">
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-purple-400 mb-3">Event Details:</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {item.eventDetails.map((event, idx) => (
                            <div key={idx} className="bg-zinc-900 rounded border border-zinc-700 p-3">
                              <div className="text-xs">
                                <p className="font-semibold text-zinc-200">{event.eventName}</p>
                                <p className="text-zinc-500 text-[10px]">{event.eventType}</p>
                                <div className="mt-2 space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-zinc-400">Stock Date:</span>
                                    <span className="text-zinc-300">{event.stockDate}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-zinc-400">Qty Needed:</span>
                                    <span className="text-purple-400 font-semibold">{event.qty}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}