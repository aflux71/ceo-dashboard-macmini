import { base44 } from "@/api/base44Client";

/**
 * Log an action to the audit log
 * @param {Object} params
 * @param {string} params.action - Action type (e.g., "user_created", "batch_approved")
 * @param {string} params.category - Category (user_management, production, inventory, settings, purchase_orders, recipes, forecasting, other)
 * @param {string} params.description - Human-readable description
 * @param {string} [params.entityType] - Type of entity affected
 * @param {string} [params.entityId] - ID of affected entity
 * @param {any} [params.oldValue] - Previous value
 * @param {any} [params.newValue] - New value
 * @param {Object} [params.user] - User performing the action (floorUser or appUser)
 */
export async function logAuditAction({
  action,
  category,
  description,
  entityType,
  entityId,
  oldValue,
  newValue,
  user
}) {
  try {
    await base44.entities.AuditLog.create({
      action,
      category,
      description,
      entity_type: entityType || null,
      entity_id: entityId || null,
      old_value: oldValue ? JSON.stringify(oldValue) : null,
      new_value: newValue ? JSON.stringify(newValue) : null,
      performed_by_name: user?.name || user?.full_name || user?.email || "System",
      performed_by_role: user?.role || "unknown"
    });
  } catch (error) {
    console.error("Failed to log audit action:", error);
  }
}

export default logAuditAction;