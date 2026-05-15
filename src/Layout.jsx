import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import { base44 } from "@/api/base44Client";
import { FloorPinProvider } from "@/components/auth/FloorPinContext";
import DashboardPinGate from "@/components/auth/DashboardPinGate";
import { ForecastProvider } from "@/components/forecast/ForecastContext";
import {
  Factory,
  Package,
  ClipboardList,
  History,
  ShoppingCart,
  Users,
  BarChart3,
  Menu,
  X,
  LogOut,
  Beaker,
  Truck,
  FileText,
  Settings,
  ChevronDown,
  Monitor,
  Maximize2,
  Minimize2,
  AlertOctagon,
  FileInput,
  TrendingUp,
  Wrench,
  PackageOpen,
  Droplets,
  Tag,
  Building2,
  GitMerge,
  Boxes,
  BrainCircuit,
  Activity,
  Phone,
  MapPin,
  BarChart2,
  Eye,
  Ban,
  Briefcase,
  Store
} from "lucide-react";

const portalAdminItems = [
  { name: "Portal Products", icon: Package, page: "portal-admin/products", path: "/portal-admin/products" },
  { name: "Portal Orders", icon: ClipboardList, page: "portal-admin/orders", path: "/portal-admin/orders" },
  { name: "Portal Accounts", icon: Users, page: "portal-admin/accounts", path: "/portal-admin/accounts" },
  { name: "Phone Order (Sales Rep)", icon: Phone, page: "portal-admin/sales-rep-order", path: "/portal-admin/sales-rep-order" },
];

const navItems = [
        { name: "Dashboard", icon: BarChart3, page: "Dashboard" },
        { name: "Analytics", icon: TrendingUp, page: "Analytics" },
        { name: "Issue Alerts", icon: AlertOctagon, page: "IssueAlerts", alertStyle: true },
        { name: "Equipment Repairs", icon: Wrench, page: "EquipmentRepairs", isRepairLink: true },
        { name: "Low Consumables", icon: PackageOpen, page: "LowConsumables", isConsumablesLink: true },
        { name: "Labels", icon: Tag, page: "Labels", isLabelsLink: true },
        { name: "Review Queue", icon: ClipboardList, page: "ReviewQueue", badge: true },

        { name: "Add to Inventory", icon: ShoppingCart, page: "AddToInventory", badge: true, isAddToInventoryLink: true },
        { name: "Unlabeled Products", icon: Tag, page: "UnlabeledProducts", isUnlabeledLink: true },
        { name: "Batch Travellers", icon: FileText, page: "BatchTraveler" },
        { name: "Inventory", icon: Package, page: "Inventory" },
        { name: "Bin Map", icon: MapPin, page: "BinMap" },
        { name: "Production Request", icon: ClipboardList, page: "ProductionRequest" },
        { name: "Inventory Requirements", icon: Eye, page: "InventoryRequirements" },
        { name: "Recipes", icon: Beaker, page: "Recipes" },

        { name: "Purchase Orders", icon: ShoppingCart, page: "PurchaseOrders" },
        { name: "Requisitions", icon: FileText, page: "PurchaseRequisitions", badge: true },
        { name: "Planning", icon: Factory, page: "ProductionPlanning" },

        { name: "Shop Floor", icon: Factory, page: "ShopFloorView" },
        { name: "Batch Inspection", icon: Phone, page: "BatchInspection" },
        { name: "AI Assistant", icon: BrainCircuit, page: "AIAssistant" },
        { name: "Bug Reports", icon: AlertOctagon, page: "BugReports" },
      ];

const settingsItems = [
        { name: "User Management", icon: Users, page: "UserManagement" },
        { name: "Line Capacity", icon: Factory, page: "LineCapacity" },
        { name: "Recipe Templates", icon: FileInput, page: "RecipeTemplates" },
        { name: "Suppliers", icon: Truck, page: "Suppliers" },
        { name: "Co-packers", icon: Building2, page: "Copackers" },
        { name: "Bulk Upload", icon: FileText, page: "BulkUpload" },
        { name: "Product Categories", icon: Tag, page: "CategorySettings" },
        { name: "Measurement Units", icon: Package, page: "MeasurementSettings" },
        { name: "SKU Dedup", icon: GitMerge, page: "SKUDeduplication" },
        { name: "Master Exclusion List", icon: Ban, page: "MasterExclusionList" },
        { name: "Missing Inventory", icon: AlertOctagon, page: "MissingInventory" },
        { name: "Audit Log", icon: ClipboardList, page: "AuditLog" },
        { name: "Recipe Versions", icon: History, page: "RecipeVersions" },
        { name: "Sync Log", icon: History, page: "SyncLog" },
      ];

export default function Layout({ children, currentPageName }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
      const [settingsOpen, setSettingsOpen] = useState(false);
      const [portalOpen, setPortalOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(true);
      const [user, setUser] = useState(null);
      const [isFullScreen, setIsFullScreen] = useState(currentPageName === "Kiosk");
      const [issueCount, setIssueCount] = useState(0);
          const [productionQueueCount, setProductionQueueCount] = useState({ started: 0, onHold: 0 });
          const [newRepairCount, setNewRepairCount] = useState(0);
        const [pendingConsumablesCount, setPendingConsumablesCount] = useState(0);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const [pendingQcCount, setPendingQcCount] = useState(0);

  // Fetch production queue counts and approved batches (staggered)
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [batches, approvedBatches] = await Promise.all([
          base44.entities.Batch.filter({ status: { $in: ['started', 'on_hold', 'draft', 'pending_qc'] } }),
          base44.entities.Batch.filter({ status: 'approved' })
        ]);
        setProductionQueueCount({
          started: batches.filter(b => b.status === 'started').length,
          onHold: batches.filter(b => b.status === 'on_hold').length,
          total: batches.filter(b => b.status !== 'pending_qc').length
        });
        setPendingQcCount(batches.filter(b => b.status === 'pending_qc').length);
        setApprovedBatchCount(approvedBatches.length);
      } catch (err) {
        setProductionQueueCount({ started: 0, onHold: 0, total: 0 });
        setPendingQcCount(0);
        setApprovedBatchCount(0);
      }
    };
    const timeout = setTimeout(fetchCounts, 500);
    const interval = setInterval(fetchCounts, 60000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  // Fetch new equipment repair count (staggered)
  useEffect(() => {
    const fetchRepairCount = async () => {
      try {
        const repairs = await base44.entities.EquipmentRepair.filter({
          status: 'new_submission'
        });
        setNewRepairCount(repairs.length);
      } catch (err) {
        setNewRepairCount(0);
      }
    };
    const timeout = setTimeout(fetchRepairCount, 2000);
    const interval = setInterval(fetchRepairCount, 60000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  // Fetch pending consumables count (staggered)
  useEffect(() => {
    const fetchConsumablesCount = async () => {
      try {
        const reports = await base44.entities.ConsumableReport.filter({
          status: 'pending'
        });
        setPendingConsumablesCount(reports.length);
      } catch (err) {
        setPendingConsumablesCount(0);
      }
    };
    const timeout = setTimeout(fetchConsumablesCount, 3500);
    const interval = setInterval(fetchConsumablesCount, 60000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  // Fetch approved batch count for Add to Inventory
  const [approvedBatchCount, setApprovedBatchCount] = useState(0);
  const [reviewQueueCount, setReviewQueueCount] = useState(0);

  // Fetch review queue count (staggered)
  useEffect(() => {
    const fetchReviewQueueCount = async () => {
      try {
        const batches = await base44.entities.Batch.filter({ status: 'in_review' });
        setReviewQueueCount(batches.length);
      } catch (err) {
        setReviewQueueCount(0);
      }
    };
    const timeout = setTimeout(fetchReviewQueueCount, 1500);
    const interval = setInterval(fetchReviewQueueCount, 60000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, []);

  // Fetch low label count (staggered)
  const [unlabeledCount, setUnlabeledCount] = useState(0);
  useEffect(() => {
    const fetchUnlabeledCount = async () => {
      try {
        const items = await base44.entities.UnlabeledProduct.list();
        setUnlabeledCount(items.length);
      } catch { setUnlabeledCount(0); }
    };
    const timeout = setTimeout(fetchUnlabeledCount, 4000);
    const interval = setInterval(fetchUnlabeledCount, 60000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, []);

  const [lowLabelCount, setLowLabelCount] = useState(0);
  useEffect(() => {
    const fetchLabelCount = async () => {
      try {
        const labels = await base44.entities.Label.list();
        const lowCount = labels.filter(l => l.current_quantity <= l.reorder_point).length;
        setLowLabelCount(lowCount);
      } catch (err) {
        setLowLabelCount(0);
      }
    };
    const timeout = setTimeout(fetchLabelCount, 4500);
    const interval = setInterval(fetchLabelCount, 60000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  // Fetch issue count for nav styling (staggered)
  useEffect(() => {
    const fetchIssueCount = async () => {
      try {
        const [scheduledItems, recipes] = await Promise.all([
          base44.entities.ForecastSuggestion.filter({
            status: { $in: ['suggested', 'scheduled', 'on_hold', 'in_progress'] }
          }),
          base44.entities.Recipe.list()
        ]);
        const recipeSKUs = new Set(recipes.map(r => r.sku));
        const count = scheduledItems.filter(item => !recipeSKUs.has(item.sku)).length;
        setIssueCount(count);
      } catch (err) {
        setIssueCount(0);
      }
    };
    const timeout = setTimeout(fetchIssueCount, 5500);
    const interval = setInterval(fetchIssueCount, 60000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (currentPageName === "Kiosk") {
      setIsFullScreen(true);
    }
  }, [currentPageName]);

  const handleLogout = () => {
    base44.auth.logout();
  };

  return (
    <FloorPinProvider>
    <ForecastProvider>
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <style>{`
        :root {
          --background: 240 10% 3.9%;
          --foreground: 0 0% 98%;
          --card: 240 10% 7%;
          --card-foreground: 0 0% 98%;
          --popover: 240 10% 7%;
          --popover-foreground: 0 0% 98%;
          --primary: 24.6 95% 53.1%;
          --primary-foreground: 0 0% 98%;
          --secondary: 240 5.9% 12%;
          --secondary-foreground: 0 0% 98%;
          --muted: 240 5.9% 12%;
          --muted-foreground: 240 5% 64.9%;
          --accent: 240 5.9% 12%;
          --accent-foreground: 0 0% 98%;
          --destructive: 0 84.2% 60.2%;
          --destructive-foreground: 0 0% 98%;
          --border: 240 5.9% 18%;
          --input: 240 5.9% 18%;
          --ring: 24.6 95% 53.1%;
        }
        body {
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #18181b; }
        ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #52525b; }
      `}</style>

      {/* Mobile Header */}
              <div className={`${isFullScreen ? '' : 'lg:hidden'} fixed top-0 left-0 right-0 h-16 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 z-50`}>
                <button
                  onClick={() => isFullScreen ? setIsFullScreen(false) : setSidebarOpen(true)}
                  className="p-2 hover:bg-zinc-800 rounded-lg"
                >
                  {isFullScreen ? <Minimize2 className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
                <span className="text-xl font-bold">neōb</span>
                <div className="w-10" />
              </div>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
              <aside className={`
                fixed top-0 left-0 h-full w-64 bg-zinc-900 border-r border-zinc-800 z-50
                transform transition-transform duration-300 ease-in-out
                ${isFullScreen ? '-translate-x-full' : sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
              `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-zinc-800">
            <div className="flex items-center gap-2">
                                <span className="text-2xl font-bold text-white">neōb</span>
                                <span className="text-xs px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded-full font-medium">
                                  260515.1
                                </span>
                              </div>
                              <button
                                                  onClick={() => setIsFullScreen(!isFullScreen)}
                                                  className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-orange-400 transition-colors"
                                                  title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
                                                >
                                                  {isFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                                                </button>
                                                <Link
                                                  to={createPageUrl("Kiosk")}
                                                  className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-orange-400 transition-colors"
                                                  title="Kiosk Mode"
                                                >
                                                  <Monitor className="w-5 h-5" />
                                                </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 hover:bg-zinc-800 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-4 px-3 overflow-y-auto">
            <button
              onClick={() => setNavOpen(!navOpen)}
              className="w-full px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between hover:text-zinc-400 transition-colors mb-1"
            >
              <div className="flex items-center gap-2">
                <Menu className="w-4 h-4" />
                Navigation
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${navOpen ? 'rotate-0' : '-rotate-90'}`} />
            </button>
            {navOpen && user?.role !== 'portal' && user?.role !== 'store_portal_access' && <div className="space-y-1">
              {navItems.map((item) => {
                const isActive = currentPageName === item.page;
                const showAlertStyle = item.alertStyle && issueCount > 0;
                const isRepairItem = item.isRepairLink;
                const hasNewRepairs = newRepairCount > 0;
                const isConsumablesItem = item.isConsumablesLink;
                const hasPendingConsumables = pendingConsumablesCount > 0;
                const isLabelsItem = item.isLabelsLink;
                const hasLowLabels = lowLabelCount > 0;
                const isUnlabeledItem = item.isUnlabeledLink;
                const hasUnlabeled = unlabeledCount > 0;
                const isAddToInventoryItem = item.isAddToInventoryLink;
                const hasApprovedBatches = approvedBatchCount > 0;
                const isReviewQueueItem = item.page === "ReviewQueue";
                const hasReviewItems = reviewQueueCount > 0;
                const isQueueItem = item.isQueueLink;
                const queueHasItems = productionQueueCount.total > 0;
                return (
                  <Link
                    key={item.name}
                    to={createPageUrl(item.page)}
                    onClick={() => setSidebarOpen(false)}
                    className={`
                      flex items-center justify-between px-3 py-1.5 rounded-lg text-sm font-medium
                      transition-colors duration-200
                      ${isActive
                        ? showAlertStyle
                          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                          : isReviewQueueItem
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                        : showAlertStyle
                          ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10'
                          : isRepairItem && hasNewRepairs
                            ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                            : isConsumablesItem && hasPendingConsumables
                              ? 'text-orange-400 hover:text-orange-300 hover:bg-orange-500/10'
                              : isLabelsItem && hasLowLabels
                                ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                                : isUnlabeledItem && hasUnlabeled
                                  ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                                : isAddToInventoryItem && hasApprovedBatches
                                  ? 'text-green-400 hover:text-green-300 hover:bg-green-500/10'
                                  : isReviewQueueItem && hasReviewItems
                                    ? 'text-purple-400 hover:text-purple-300 hover:bg-purple-500/10'
                                    : isQueueItem
                                      ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 ml-4 border-l-2 border-zinc-700'
                                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className={`w-5 h-5 ${showAlertStyle ? 'text-red-400' : isRepairItem && hasNewRepairs ? 'text-amber-400' : isConsumablesItem && hasPendingConsumables ? 'text-orange-400' : isLabelsItem && hasLowLabels ? 'text-amber-400' : isUnlabeledItem && hasUnlabeled ? 'text-amber-400' : isAddToInventoryItem && hasApprovedBatches ? 'text-green-400' : isReviewQueueItem && hasReviewItems ? 'text-purple-400' : ''}`} />
                      {item.name}
                    </div>
                    {item.badge && pendingQcCount > 0 && (
                      <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                    )}
                    {isRepairItem && hasNewRepairs && (
                      <span className="flex items-center gap-1 text-xs text-amber-400">
                        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
                        {newRepairCount}
                      </span>
                    )}
                    {isConsumablesItem && hasPendingConsumables && (
                      <span className="flex items-center gap-1 text-xs text-orange-400">
                        <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse"></span>
                        {pendingConsumablesCount}
                      </span>
                    )}
                    {isLabelsItem && hasLowLabels && (
                      <span className="flex items-center gap-1 text-xs text-amber-400">
                        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
                        {lowLabelCount}
                      </span>
                    )}
                    {isAddToInventoryItem && hasApprovedBatches && (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                        {approvedBatchCount}
                      </span>
                    )}
                    {isUnlabeledItem && hasUnlabeled && (
                      <span className="flex items-center gap-1 text-xs text-amber-400">
                        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
                        {unlabeledCount}
                      </span>
                    )}
                    {isReviewQueueItem && hasReviewItems && (
                      <span className="flex items-center gap-1 text-xs text-purple-400">
                        <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse"></span>
                        {reviewQueueCount}
                      </span>
                    )}
                    {isQueueItem && queueHasItems && (
                      <div className="flex items-center gap-1">
                        {productionQueueCount.started > 0 && (
                          <span className="flex items-center gap-1 text-xs text-blue-400">
                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></span>
                            {productionQueueCount.started}
                          </span>
                        )}
                        {productionQueueCount.onHold > 0 && (
                          <span className="flex items-center gap-1 text-xs text-amber-400 ml-1">
                            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full"></span>
                            {productionQueueCount.onHold}
                          </span>
                        )}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>}

            {/* Store Portal Section (admin + portal roles) */}
            {(user?.role === 'admin' || user?.role === 'portal' || user?.role === 'store_portal_access') && (
              <div className="mt-6 pt-4 border-t border-zinc-800">
                <button
                  onClick={() => setPortalOpen(!portalOpen)}
                  className="w-full px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between hover:text-zinc-400 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4" />
                    Store Portal
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform ${portalOpen ? 'rotate-0' : '-rotate-90'}`} />
                </button>
                {portalOpen && (
                  <div className="space-y-1 mt-1">
                    {portalAdminItems
                      .filter((item) => {
                        const adminOnly = ["portal-admin/products", "portal-admin/accounts"];
                        if (adminOnly.includes(item.page) && user?.role !== 'admin') return false;
                        return true;
                      })
                      .map((item) => {
                      const isActive = typeof window !== 'undefined' && window.location.pathname === item.path;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setSidebarOpen(false)}
                          className={`
                            flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium
                            transition-colors duration-200
                            ${isActive
                              ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                            }
                          `}
                        >
                          <item.icon className="w-5 h-5" />
                          {item.name}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Settings Section (hidden for portal-only users) */}
                                      {user?.role !== 'portal' && user?.role !== 'store_portal_access' && <div className="mt-6 pt-4 border-t border-zinc-800">
                                        <button
                                          onClick={() => setSettingsOpen(!settingsOpen)}
                                          className="w-full px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between hover:text-zinc-400 transition-colors"
                                        >
                                          <div className="flex items-center gap-2">
                                            <Settings className="w-4 h-4" />
                                            Settings
                                          </div>
                                          <ChevronDown className={`w-4 h-4 transition-transform ${settingsOpen ? 'rotate-0' : '-rotate-90'}`} />
                                        </button>
                                        {settingsOpen && (
                                        <div className="space-y-1 mt-1">
                                        {settingsItems.map((item) => {
                                          const isActive = currentPageName === item.page;
                                          return (
                                            <Link
                                              key={item.page}
                                              to={createPageUrl(item.page)}
                                              onClick={() => setSidebarOpen(false)}
                                              className={`
                                                flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium
                                                transition-colors duration-200
                                                ${isActive
                                                  ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                                                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                                                }
                                              `}
                                            >
                                              <item.icon className="w-5 h-5" />
                                              {item.name}
                                            </Link>
                                          );
                                        })}
                                        </div>
                                        )}
                                        </div>}
                      </nav>

          {/* User Section */}
          <div className="p-4 border-t border-zinc-800">
            {user ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center">
                    <span className="text-orange-400 font-semibold text-sm">
                      {user.full_name?.[0] || user.email?.[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {user.full_name || 'User'}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">{user.role}</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="text-sm text-zinc-500">Loading...</div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
              <main className={`min-h-screen pt-16 lg:pt-0 transition-all duration-300 ${isFullScreen ? 'lg:ml-0' : 'lg:ml-64'}`}>
        <div className="p-4 lg:p-6">
          <DashboardPinGate>{children}</DashboardPinGate>
        </div>
      </main>
    </div>
    </ForecastProvider>
    </FloorPinProvider>
  );
}