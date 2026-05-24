import React from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Search } from "lucide-react";

export default function ProfitabilityFilters({
  search, onSearch,
  category, onCategory, categories,
  status, onStatus,
  sortBy, onSortBy
}) {
  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="relative flex-1 min-w-[240px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by SKU or product name…"
          className="pl-9 bg-zinc-900 border-zinc-700 text-zinc-200"
        />
      </div>

      <Select value={category} onValueChange={onCategory}>
        <SelectTrigger className="w-44 bg-zinc-900 border-zinc-700 text-zinc-200">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-200">
          <SelectItem value="all">All categories</SelectItem>
          {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={status} onValueChange={onStatus}>
        <SelectTrigger className="w-44 bg-zinc-900 border-zinc-700 text-zinc-200">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-200">
          <SelectItem value="all">All products</SelectItem>
          <SelectItem value="below">Below target</SelectItem>
          <SelectItem value="on_target">On target</SelectItem>
          <SelectItem value="no_target">No target set</SelectItem>
          <SelectItem value="no_price">Missing price</SelectItem>
          <SelectItem value="has_gaps">Has cost gaps</SelectItem>
        </SelectContent>
      </Select>

      <Select value={sortBy} onValueChange={onSortBy}>
        <SelectTrigger className="w-52 bg-zinc-900 border-zinc-700 text-zinc-200">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-200">
          <SelectItem value="margin_asc">Retail margin (low → high)</SelectItem>
          <SelectItem value="margin_desc">Retail margin (high → low)</SelectItem>
          <SelectItem value="wsmargin_asc">Wholesale margin (low → high)</SelectItem>
          <SelectItem value="cost_desc">Dead net cost (high → low)</SelectItem>
          <SelectItem value="name">Product name</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}