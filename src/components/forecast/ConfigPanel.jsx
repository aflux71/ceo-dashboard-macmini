import React, { useState } from "react";
import { Settings, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function ConfigPanel({ config, onChange }) {
  const [showMonthly, setShowMonthly] = useState(false);
  const [showCategory, setShowCategory] = useState(false);
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const categories = [
    'Bar Soap', 'Bath Bombs', 'Body Lotion & Butter', 'Body Spritz',
    'Body Wash & Soap', 'Candles', 'Cleaning & Laundry', 'Essential Oils',
    'Experiences', 'Face Care', 'Food & Culinary', 'Foot Care', 'Gifts & Sets',
    'Lip Balm', 'Massage & Body Oil', 'Other', 'Pet Care', 'Pillow & Room Spray',
    'Plants & Fresh', 'Refills', 'Roll-Ons', 'Sachets & Dried', 'Shampoo & Conditioner'
  ];
  
  const monthlyGrowth = config.monthly_growth || {};
  const categoryGrowth = config.category_growth || {};

  const updateMonthlyGrowth = (month, value) => {
    const updated = { ...monthlyGrowth, [month]: parseFloat(value) || 0 };
    onChange({ ...config, monthly_growth: updated });
  };

  const updateCategoryGrowth = (category, value) => {
    const updated = { ...categoryGrowth, [category]: parseFloat(value) || 0 };
    onChange({ ...config, category_growth: updated });
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Forecast Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">Overall Growth (%)</Label>
            <Input
              type="number"
              step="0.1"
              value={config.growth || 0}
              onChange={(e) => onChange({...config, growth: parseFloat(e.target.value) || 0})}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">Lead Time (weeks)</Label>
            <Input
              type="number"
              value={config.lead_time || 3}
              onChange={(e) => onChange({...config, lead_time: parseInt(e.target.value) || 3})}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">Safety Stock (%)</Label>
            <Input
              type="number"
              step="1"
              value={config.safety_stock_percent || 20}
              onChange={(e) => onChange({...config, safety_stock_percent: parseFloat(e.target.value) || 20})}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">Forecast Months</Label>
            <Input
              type="number"
              value={config.forecast_months || 12}
              onChange={(e) => onChange({...config, forecast_months: parseInt(e.target.value) || 12})}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
        </div>

        <div className="space-y-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowCategory(!showCategory)}
          >
            <TrendingUp className="w-3 h-3 mr-2" />
            {showCategory ? 'Hide' : 'Show'} Category Growth Adjustments
          </Button>

          {showCategory && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
              {categories.map((category) => (
                <div key={category} className="space-y-1">
                  <Label className="text-xs text-zinc-500">{category}</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="1"
                      value={categoryGrowth[category] || 0}
                      onChange={(e) => updateCategoryGrowth(category, e.target.value)}
                      className="bg-zinc-800 border-zinc-700 text-sm pr-6"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500">%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowMonthly(!showMonthly)}
            className="mb-3"
          >
            <TrendingUp className="w-3 h-3 mr-2" />
            {showMonthly ? 'Hide' : 'Show'} Monthly Seasonality Adjustments
          </Button>

          {showMonthly && (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
              {monthNames.map((month, idx) => (
                <div key={idx} className="space-y-1">
                  <Label className="text-xs text-zinc-500">{month}</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="1"
                      value={monthlyGrowth[idx + 1] || 0}
                      onChange={(e) => updateMonthlyGrowth(idx + 1, e.target.value)}
                      className="bg-zinc-800 border-zinc-700 text-sm pr-6"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500">%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}