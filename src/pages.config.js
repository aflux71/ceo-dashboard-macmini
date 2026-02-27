/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Copackers from './pages/Copackers';
import AddToInventory from './pages/AddToInventory';
import Analytics from './pages/Analytics';
import AuditLog from './pages/AuditLog';
import BatchHistory from './pages/BatchHistory';
import BulkUpload from './pages/BulkUpload';
import Dashboard from './pages/Dashboard';
import EquipmentRepairs from './pages/EquipmentRepairs';
import Forecasting from './pages/Forecasting';
import Inventory from './pages/Inventory';
import IssueAlerts from './pages/IssueAlerts';
import Kiosk from './pages/Kiosk';
import LabelPurchaseOrders from './pages/LabelPurchaseOrders';
import LabelUsage from './pages/LabelUsage';
import Labels from './pages/Labels';
import LineCapacity from './pages/LineCapacity';
import LowConsumables from './pages/LowConsumables';
import MeasurementSettings from './pages/MeasurementSettings';
import ProductionPlanning from './pages/ProductionPlanning';
import PurchaseOrders from './pages/PurchaseOrders';
import PurchaseRequisitions from './pages/PurchaseRequisitions';
import RecipeTemplates from './pages/RecipeTemplates';
import RecipeVersions from './pages/RecipeVersions';
import Recipes from './pages/Recipes';
import ReviewQueue from './pages/ReviewQueue';
import Suppliers from './pages/Suppliers';
import UserManagement from './pages/UserManagement';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Copackers": Copackers,
    "AddToInventory": AddToInventory,
    "Analytics": Analytics,
    "AuditLog": AuditLog,
    "BatchHistory": BatchHistory,
    "BulkUpload": BulkUpload,
    "Dashboard": Dashboard,
    "EquipmentRepairs": EquipmentRepairs,
    "Forecasting": Forecasting,
    "Inventory": Inventory,
    "IssueAlerts": IssueAlerts,
    "Kiosk": Kiosk,
    "LabelPurchaseOrders": LabelPurchaseOrders,
    "LabelUsage": LabelUsage,
    "Labels": Labels,
    "LineCapacity": LineCapacity,
    "LowConsumables": LowConsumables,
    "MeasurementSettings": MeasurementSettings,
    "ProductionPlanning": ProductionPlanning,
    "PurchaseOrders": PurchaseOrders,
    "PurchaseRequisitions": PurchaseRequisitions,
    "RecipeTemplates": RecipeTemplates,
    "RecipeVersions": RecipeVersions,
    "Recipes": Recipes,
    "ReviewQueue": ReviewQueue,
    "Suppliers": Suppliers,
    "UserManagement": UserManagement,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};