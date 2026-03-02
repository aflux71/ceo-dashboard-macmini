import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  Search,
  Plus,
  Factory,
  AlertTriangle,
  List,
  LayoutGrid,
  CalendarPlus,
  ClipboardList
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { format, addDays, subDays, startOfWeek } from "date-fns";
import { createPageUrl } from "@/utils";
import GanttTimeline from "@/components/schedule/GanttTimeline";
import ScheduleModal from "@/components/schedule/ScheduleModal";
import ConflictModal from "@/components/schedule/ConflictModal";
import Badge from "@/components/ui/Badge";
import { useFloorPin } from "@/components/auth/FloorPinContext";

const DEFAULT_PRODUCTION_TAGS = [
  { value: "urgent", label: "Urgent", color: "red" },
  { value: "seasonal", label: "Seasonal", color: "purple" },
  { value: "sample", label: "Sample", color: "cyan" },
  { value: "expedited", label: "Expedited", color: "orange" }
];

export default function ProductionSchedule() {
  const [viewStartDate, setViewStartDate] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [daysToShow, setDaysToShow] = useState(14);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [lineFilter, setLineFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [viewMode, setViewMode] = useState("gantt"); // gantt or list
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);

  const { floorUser } = useFloorPin();
  const canDelete = floorUser?.role === 'admin' || floorUser?.role === 'owner';

  const queryClient = useQueryClient();

  // Check for incoming schedule request from UrgentSKUsList
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const scheduleSku = urlParams.get('schedule');
    
    if (scheduleSku) {
      const storedItem = sessionStorage.getItem('scheduleItem');
      if (storedItem) {
        const itemData = JSON.parse(storedItem);
        // Create a new ForecastSuggestion-like object for scheduling
        setSelectedItem({
          ...itemData,
          status: 'suggested'
        });
        setModalOpen(true);
        sessionStorage.removeItem('scheduleItem');
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);

  // Fetch scheduled items
  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['scheduled-production'],
    queryFn: async () => {
      const suggestions = await base44.entities.ForecastSuggestion.filter({
        status: { $in: ['scheduled', 'on_hold', 'in_progress', 'completed'] }
      });
      return suggestions;
    }
  });

  // Fetch recipes for timing info
  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.list()
  });

  // Fetch settings
  const { data: settings } = useQuery({
    queryKey: ['settings', 'production_scheduling'],
    queryFn: async () => {
      const allSettings = await base44.entities.AppSettings.list();
      const degassing = allSettings.find(s => s.key === 'default_degassing_days');
      const qcHold = allSettings.find(s => s.key === 'default_qc_hold_days');
      const tags = allSettings.find(s => s.key === 'production_tags');
      
      return {
        degassingDays: degassing ? parseInt(degassing.value) : 0,
        qcHoldDays: qcHold ? parseInt(qcHold.value) : 0,
        productionTags: tags ? JSON.parse(tags.value) : DEFAULT_PRODUCTION_TAGS
      };
    }
  });

  // Create schedule mutation (for new items from urgent list)
  const createScheduleMutation = useMutation({
    mutationFn: async (data) => {
      return base44.entities.ForecastSuggestion.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-production'] });
      queryClient.invalidateQueries({ queryKey: ['forecast-suggestions'] });
      toast.success('Production run scheduled');
      setModalOpen(false);
    },
    onError: (err) => {
      toast.error('Failed to schedule production');
    }
  });

  // Update schedule mutation
  const updateScheduleMutation = useMutation({
    mutationFn: async (data) => {
      return base44.entities.ForecastSuggestion.update(data.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-production'] });
      queryClient.invalidateQueries({ queryKey: ['forecast-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['forecast_suggestions'] });
      toast.success('Schedule updated');
      setModalOpen(false);
    },
    onError: (err) => {
      toast.error('Failed to update schedule');
    }
  });

  // Delete schedule mutation
  const deleteScheduleMutation = useMutation({
    mutationFn: async (id) => {
      return base44.entities.ForecastSuggestion.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-production'] });
      queryClient.invalidateQueries({ queryKey: ['forecast-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['forecast_suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      toast.success('Scheduled run deleted');
      setModalOpen(false);
    },
    onError: (err) => {
      toast.error('Failed to delete scheduled run');
    }
  });

  // Filter schedules
  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      if (searchQuery && !s.product_name?.toLowerCase().includes(searchQuery.toLowerCase()) && 
          !s.sku?.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (lineFilter !== "all" && s.assigned_production_line !== parseInt(lineFilter)) return false;
      if (tagFilter !== "all" && !s.tags?.includes(tagFilter)) return false;
      return true;
    });
  }, [schedules, searchQuery, statusFilter, lineFilter, tagFilter]);

  // Find conflicts
  const { conflictCount, conflictPairs } = useMemo(() => {
    const pairs = [];
    const activeSchedules = schedules.filter(s => s.status !== 'completed');
    
    for (let i = 0; i < activeSchedules.length; i++) {
      for (let j = i + 1; j < activeSchedules.length; j++) {
        const a = activeSchedules[i];
        const b = activeSchedules[j];
        
        if (a.assigned_production_line !== b.assigned_production_line) continue;
        
        const aStart = new Date(a.scheduled_start_date);
        const aEnd = a.scheduled_end_date ? new Date(a.scheduled_end_date) : addDays(aStart, 1);
        const bStart = new Date(b.scheduled_start_date);
        const bEnd = b.scheduled_end_date ? new Date(b.scheduled_end_date) : addDays(bStart, 1);
        
        if (aStart < bEnd && aEnd > bStart) {
          // Check if both items have acknowledged the conflict
          const isAcknowledged = a.conflict_acknowledged && b.conflict_acknowledged;
          pairs.push({ a, b, acknowledged: isAcknowledged });
        }
      }
    }
    const unresolvedPairs = pairs.filter(p => !p.acknowledged);
    return { conflictCount: unresolvedPairs.length, conflictPairs: unresolvedPairs };
  }, [schedules]);

  const handleDismissConflict = async (pair) => {
    // Mark both items as conflict acknowledged
    await Promise.all([
      base44.entities.ForecastSuggestion.update(pair.a.id, { conflict_acknowledged: true }),
      base44.entities.ForecastSuggestion.update(pair.b.id, { conflict_acknowledged: true })
    ]);
    queryClient.invalidateQueries({ queryKey: ['scheduled-production'] });
    toast.success('Conflict acknowledged');
  };

  const handleItemClick = (item) => {
    setSelectedItem(item);
    setModalOpen(true);
  };

  const handleAddNew = (date, line) => {
    setSelectedItem({
      status: 'new',
      scheduled_start_date: date.toISOString(),
      assigned_production_line: line,
      suggested_qty: 1
    });
    setModalOpen(true);
  };

  const handleStatusChange = async (item, newStatus) => {
    if (newStatus === 'in_progress') {
      // Navigate to production entry with the item data
      sessionStorage.setItem('productionItem', JSON.stringify(item));
      window.location.href = createPageUrl('ProductionEntry') + '?fromSchedule=' + item.id;
    } else {
      updateScheduleMutation.mutate({ ...item, status: newStatus });
    }
  };

  const handleDragEnd = (updatedItem) => {
    updateScheduleMutation.mutate(updatedItem);
  };

  const handleSaveSchedule = (data) => {
    if (data.id) {
      updateScheduleMutation.mutate(data);
    } else {
      // New item from urgent list - create it
      createScheduleMutation.mutate(data);
    }
  };

  const handleDeleteSchedule = (id) => {
    if (canDelete) {
      deleteScheduleMutation.mutate(id);
    } else {
      toast.error('Only admin or owner can delete scheduled runs');
    }
  };

  const navigateTimeline = (direction) => {
    setViewStartDate(prev => 
      direction === 'next' ? addDays(prev, 7) : subDays(prev, 7)
    );
  };

  const goToToday = () => {
    setViewStartDate(startOfWeek(new Date(), { weekStartsOn: 1 }));
  };

  const productionTags = settings?.productionTags || DEFAULT_PRODUCTION_TAGS;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-orange-400" />
            Production Schedule
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            View and manage scheduled production runs
          </p>
        </div>
        <div className="flex items-center gap-2">
          {conflictCount > 0 && (
            <Button
              variant="ghost"
              className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20"
              onClick={() => setConflictModalOpen(true)}
            >
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-sm text-red-400">{conflictCount} conflict(s)</span>
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500">Scheduled</p>
            <p className="text-2xl font-bold text-blue-400">
              {schedules.filter(s => s.status === 'scheduled').length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500">In Progress</p>
            <p className="text-2xl font-bold text-green-400">
              {schedules.filter(s => s.status === 'in_progress').length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500">On Hold</p>
            <p className="text-2xl font-bold text-amber-400">
              {schedules.filter(s => s.status === 'on_hold').length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500">Completed</p>
            <p className="text-2xl font-bold text-zinc-400">
              {schedules.filter(s => s.status === 'completed').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by product or SKU..."
                className="pl-9 bg-zinc-800 border-zinc-700"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] bg-zinc-800 border-zinc-700">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={lineFilter} onValueChange={setLineFilter}>
              <SelectTrigger className="w-[120px] bg-zinc-800 border-zinc-700">
                <SelectValue placeholder="Line" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Lines</SelectItem>
                <SelectItem value="1">Line 1</SelectItem>
                <SelectItem value="2">Line 2</SelectItem>
              </SelectContent>
            </Select>

            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="w-[130px] bg-zinc-800 border-zinc-700">
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                {productionTags.map(tag => (
                  <SelectItem key={tag.value} value={tag.value}>{tag.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1 border border-zinc-700 rounded-lg p-1">
              <Button
                variant={viewMode === 'gantt' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('gantt')}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline Navigation */}
      {viewMode === 'gantt' && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigateTimeline('prev')}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigateTimeline('next')}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="text-sm text-zinc-400 ml-2">
              {format(viewStartDate, 'MMM d')} - {format(addDays(viewStartDate, daysToShow - 1), 'MMM d, yyyy')}
            </span>
          </div>
          <Select value={String(daysToShow)} onValueChange={(v) => setDaysToShow(parseInt(v))}>
            <SelectTrigger className="w-[120px] bg-zinc-800 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="21">21 days</SelectItem>
              <SelectItem value="28">28 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Main Content */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-zinc-500">Loading schedules...</div>
          ) : viewMode === 'gantt' ? (
            <GanttTimeline
              schedules={filteredSchedules}
              startDate={viewStartDate}
              daysToShow={daysToShow}
              onItemClick={handleItemClick}
              onStatusChange={handleStatusChange}
              onDragEnd={handleDragEnd}
              onDelete={handleDeleteSchedule}
              onAddNew={handleAddNew}
              productionTags={productionTags}
              recipes={recipes}
            />
          ) : (
            <div className="divide-y divide-zinc-800">
              {filteredSchedules.length === 0 ? (
                <div className="p-8 text-center text-zinc-500">No scheduled runs found</div>
              ) : (
                filteredSchedules.map(schedule => (
                  <div 
                    key={schedule.id}
                    className="p-4 hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => handleItemClick(schedule)}
                      >
                        <p className="font-medium text-zinc-200">{schedule.product_name}</p>
                        <p className="text-sm text-zinc-500">{schedule.sku} • {schedule.suggested_qty} units</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={
                          schedule.status === 'scheduled' ? 'blue' :
                          schedule.status === 'in_progress' ? 'green' :
                          schedule.status === 'on_hold' ? 'amber' : 'default'
                        }>
                          {schedule.status}
                        </Badge>
                        <span className="text-sm text-zinc-400">
                          Line {schedule.assigned_production_line}
                        </span>
                        <span className="text-sm text-zinc-500">
                          {schedule.scheduled_start_date && format(new Date(schedule.scheduled_start_date), 'MMM d')}
                        </span>
                        <div className="flex items-center gap-1 ml-2 border-l border-zinc-700 pl-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10"
                            title="Add to Schedule"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleItemClick(schedule);
                            }}
                          >
                            <CalendarPlus className="w-4 h-4" />
                          </Button>
                          <Link
                            to={createPageUrl('RunPlanner') + '?addItem=' + encodeURIComponent(JSON.stringify({
                              sku: schedule.sku,
                              product_name: schedule.product_name,
                              suggested_qty: schedule.suggested_qty,
                              category: schedule.category,
                              production_line: schedule.assigned_production_line
                            }))}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10"
                              title="Add to Run Planner"
                            >
                              <ClipboardList className="w-4 h-4" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedule Modal */}
      <ScheduleModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        item={selectedItem}
        recipes={recipes}
        productionSettings={settings}
        productionTags={productionTags}
        existingSchedules={schedules}
        onSave={handleSaveSchedule}
        onDelete={handleDeleteSchedule}
      />

      {/* Conflict Modal */}
      <ConflictModal
        open={conflictModalOpen}
        onOpenChange={setConflictModalOpen}
        conflictPairs={conflictPairs}
        onEditItem={(item) => {
          setSelectedItem(item);
          setModalOpen(true);
        }}
        onDismissConflict={handleDismissConflict}
      />
    </div>
  );
}