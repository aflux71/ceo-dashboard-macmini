import React, { useState, useRef } from "react";
import { format, addDays, differenceInDays, startOfDay, isSameDay } from "date-fns";
import { AlertTriangle, Pause, Play, CheckCircle2, Trash2 } from "lucide-react";
import { useFloorPin } from "@/components/auth/FloorPinContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

const STATUS_COLORS = {
  scheduled: "bg-blue-500",
  on_hold: "bg-amber-500",
  in_progress: "bg-green-500",
  completed: "bg-zinc-500"
};

const STATUS_LABELS = {
  scheduled: "Scheduled",
  on_hold: "On Hold",
  in_progress: "In Progress",
  completed: "Completed"
};

export default function GanttTimeline({ 
  schedules, 
  startDate, 
  daysToShow = 14,
  onItemClick,
  onStatusChange,
  onDragEnd,
  onDelete,
  onAddNew,
  productionTags,
  recipes = []
}) {
  const { floorUser } = useFloorPin();
  // Only admin and owner can delete
  const canDelete = floorUser?.role === 'admin' || floorUser?.role === 'owner';
  
  // Check if a SKU has a recipe
  const recipeSKUs = new Set(recipes.map(r => r.sku));
  const hasRecipe = (sku) => recipeSKUs.has(sku);
  const [dragItem, setDragItem] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const timelineRef = useRef(null);
  const baseRowHeight = 90;
  const itemHeight = 80;
  const lineWidth = 280;

  const days = Array.from({ length: daysToShow }, (_, i) => addDays(startDate, i));

  const line1Schedules = schedules.filter(s => s.assigned_production_line === 1);
  const line2Schedules = schedules.filter(s => s.assigned_production_line === 2);

  // Group schedules by day for each line
  const getSchedulesForDay = (lineSchedules, day) => {
    return lineSchedules.filter(s => {
      const scheduleStart = startOfDay(new Date(s.scheduled_start_date));
      return isSameDay(scheduleStart, day);
    });
  };

  // Calculate row heights based on max items per day
  const rowHeights = days.map(day => {
    const line1Count = getSchedulesForDay(line1Schedules, day).length;
    const line2Count = getSchedulesForDay(line2Schedules, day).length;
    const maxCount = Math.max(line1Count, line2Count, 1);
    return Math.max(baseRowHeight, maxCount * itemHeight + 10);
  });

  // Calculate cumulative offset for each day
  const getRowOffset = (dayIndex) => {
    let offset = 0;
    for (let i = 0; i < dayIndex; i++) {
      offset += rowHeights[i];
    }
    return offset;
  };

  const getItemPosition = (schedule, lineSchedules) => {
    const start = new Date(schedule.scheduled_start_date);
    const startDay = startOfDay(start);
    const startDayIndex = differenceInDays(startDay, startOfDay(startDate));
    
    // Find this item's index within its day
    const daySchedules = getSchedulesForDay(lineSchedules, startDay);
    const itemIndex = daySchedules.findIndex(s => s.id === schedule.id);
    
    const rowOffset = getRowOffset(startDayIndex);
    const itemTop = rowOffset + (itemIndex * itemHeight) + 5;
    
    return {
      top: itemTop,
      height: itemHeight - 10,
      isVisible: startDayIndex >= 0 && startDayIndex < daysToShow
    };
  };

  const checkConflicts = (schedule, lineSchedules) => {
    // If this item has acknowledged conflicts, don't show warning
    if (schedule.conflict_acknowledged) return false;
    
    const start = new Date(schedule.scheduled_start_date);
    const end = schedule.scheduled_end_date 
      ? new Date(schedule.scheduled_end_date) 
      : addDays(start, 1);

    return lineSchedules.some(other => {
      if (other.id === schedule.id) return false;
      // Skip if the other item has also acknowledged
      if (other.conflict_acknowledged) return false;
      
      const otherStart = new Date(other.scheduled_start_date);
      const otherEnd = other.scheduled_end_date 
        ? new Date(other.scheduled_end_date) 
        : addDays(otherStart, 1);
      
      return start < otherEnd && end > otherStart;
    });
  };

  const handleDragStart = (e, schedule) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragItem(schedule);
    const rect = e.target.getBoundingClientRect();
    setDragOffset(e.clientY - rect.top);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, line) => {
    e.preventDefault();
    if (!dragItem || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top - dragOffset;
    
    // Find which day was dropped on
    let dayIndex = 0;
    let cumulativeHeight = 0;
    for (let i = 0; i < rowHeights.length; i++) {
      if (y < cumulativeHeight + rowHeights[i]) {
        dayIndex = i;
        break;
      }
      cumulativeHeight += rowHeights[i];
      dayIndex = i;
    }
    const newStartDate = addDays(startDate, Math.max(0, dayIndex));

    const duration = dragItem.scheduled_end_date 
      ? differenceInDays(new Date(dragItem.scheduled_end_date), new Date(dragItem.scheduled_start_date))
      : 1;

    onDragEnd?.({
      ...dragItem,
      scheduled_start_date: newStartDate.toISOString(),
      scheduled_end_date: addDays(newStartDate, duration).toISOString(),
      assigned_production_line: line
    });

    setDragItem(null);
  };

  const getTagColor = (tagValue) => {
    const tag = productionTags?.find(t => t.value === tagValue);
    return tag?.color || 'default';
  };

  const renderScheduleItem = (schedule, lineSchedules) => {
    const position = getItemPosition(schedule, lineSchedules);
    if (!position.isVisible) return null;

    const hasConflict = checkConflicts(schedule, lineSchedules);
    const statusColor = STATUS_COLORS[schedule.status] || STATUS_COLORS.scheduled;

    const noRecipe = !hasRecipe(schedule.sku);
    
    return (
      <DropdownMenu key={schedule.id}>
        <DropdownMenuTrigger asChild>
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, schedule)}
            onClick={() => onItemClick?.(schedule)}
            className={`absolute left-2 right-2 rounded-lg cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg z-10 ${
              hasConflict ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-zinc-900' : ''
            }`}
            style={{
              top: position.top + 4,
              height: position.height,
              minHeight: 60
            }}
          >
            <div className={`h-full rounded-lg ${statusColor}/20 border ${statusColor.replace('bg-', 'border-')}/50 p-3 overflow-hidden`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">{schedule.product_name}</p>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">{schedule.sku}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  {noRecipe && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">No Recipe</span>
                  )}
                  {hasConflict && (
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded ${statusColor}/30 ${statusColor.replace('bg-', 'text-').replace('-500', '-300')}`}>
                  {STATUS_LABELS[schedule.status]}
                </span>
                {schedule.tags?.slice(0, 2).map(tag => (
                  <span key={tag} className={`text-xs px-2 py-0.5 rounded bg-${getTagColor(tag)}-500/20 text-${getTagColor(tag)}-400`}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-zinc-900 border-zinc-800">
          <DropdownMenuItem onClick={() => onItemClick?.(schedule)}>
            Edit Schedule
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {schedule.status !== 'in_progress' && (
            <DropdownMenuItem onClick={() => onStatusChange?.(schedule, 'in_progress')}>
              <Play className="w-4 h-4 mr-2" /> Start Production
            </DropdownMenuItem>
          )}
          {schedule.status !== 'on_hold' && (
            <DropdownMenuItem onClick={() => onStatusChange?.(schedule, 'on_hold')}>
              <Pause className="w-4 h-4 mr-2" /> Put On Hold
            </DropdownMenuItem>
          )}
          {schedule.status !== 'completed' && (
            <DropdownMenuItem onClick={() => onStatusChange?.(schedule, 'completed')}>
              <CheckCircle2 className="w-4 h-4 mr-2" /> Mark Complete
            </DropdownMenuItem>
          )}
          {schedule.status === 'on_hold' && (
            <DropdownMenuItem onClick={() => onStatusChange?.(schedule, 'scheduled')}>
              Resume (Scheduled)
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => onDelete?.(schedule.id)}
                className="text-red-400 focus:text-red-300 focus:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4 mr-2" /> Delete Run
              </DropdownMenuItem>
            </>
          )}
          </DropdownMenuContent>
          </DropdownMenu>
    );
  };

  return (
    <div className="overflow-y-auto max-h-[calc(100vh-280px)] border border-zinc-800 rounded-lg">
      <div ref={timelineRef} className="min-h-max">
        {/* Header - Production Lines */}
        <div className="flex border-b border-zinc-800 sticky top-0 bg-zinc-900 z-20">
          <div className="w-28 flex-shrink-0 p-3 border-r border-zinc-800 bg-zinc-900">
            <span className="text-xs text-zinc-500 font-medium">Date</span>
          </div>
          <div 
            className="flex-1 p-3 border-r border-zinc-800 bg-zinc-800/50 text-center"
            style={{ minWidth: lineWidth }}
          >
            <span className="text-sm font-semibold text-zinc-200">Line 1</span>
          </div>
          <div 
            className="flex-1 p-3 bg-zinc-800/50 text-center"
            style={{ minWidth: lineWidth }}
          >
            <span className="text-sm font-semibold text-zinc-200">Line 2</span>
          </div>
        </div>

        {/* Timeline Grid */}
        <div className="flex">
          {/* Date Column */}
          <div className="w-28 flex-shrink-0 border-r border-zinc-800 bg-zinc-900/50">
            {days.map((day, i) => (
              <div 
                key={i} 
                className={`border-b border-zinc-800/50 p-3 ${
                  isSameDay(day, new Date()) ? 'bg-orange-500/10' : ''
                }`}
                style={{ height: rowHeights[i] }}
              >
                <p className="text-xs text-zinc-500">{format(day, 'EEE')}</p>
                <p className={`text-lg font-semibold ${isSameDay(day, new Date()) ? 'text-orange-400' : 'text-zinc-300'}`}>
                  {format(day, 'd')}
                </p>
                <p className="text-xs text-zinc-600">{format(day, 'MMM')}</p>
              </div>
            ))}
          </div>

          {/* Line 1 Column */}
          <div 
            className="flex-1 relative border-r border-zinc-800"
            style={{ minWidth: lineWidth }}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, 1)}
          >
            {/* Row grid lines */}
            {days.map((day, i) => (
              <div 
                key={i}
                onClick={() => onAddNew?.(day, 1)}
                className={`border-b border-zinc-800/50 cursor-pointer hover:bg-zinc-800/30 transition-colors ${
                  isSameDay(day, new Date()) ? 'bg-orange-500/5' : ''
                }`}
                style={{ height: rowHeights[i] }}
              />
            ))}
            {/* Schedule items */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="pointer-events-auto">
                {line1Schedules.map(s => renderScheduleItem(s, line1Schedules))}
              </div>
            </div>
          </div>

          {/* Line 2 Column */}
          <div 
            className="flex-1 relative"
            style={{ minWidth: lineWidth }}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, 2)}
          >
            {/* Row grid lines */}
            {days.map((day, i) => (
              <div 
                key={i}
                onClick={() => onAddNew?.(day, 2)}
                className={`border-b border-zinc-800/50 cursor-pointer hover:bg-zinc-800/30 transition-colors ${
                  isSameDay(day, new Date()) ? 'bg-orange-500/5' : ''
                }`}
                style={{ height: rowHeights[i] }}
              />
            ))}
            {/* Schedule items */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="pointer-events-auto">
                {line2Schedules.map(s => renderScheduleItem(s, line2Schedules))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}