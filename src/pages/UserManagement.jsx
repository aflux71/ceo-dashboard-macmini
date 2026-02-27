import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Shield,
  Clock,
  Save,
  Mail,
  UserPlus,
  Settings,
  X,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import Badge from "@/components/ui/Badge";
import { useFloorPin } from "@/components/auth/FloorPinContext";
import { logAuditAction } from "@/components/audit/auditLogger";
import { Checkbox } from "@/components/ui/checkbox";

// Default role permissions
const DEFAULT_ROLE_PERMISSIONS = {
  owner: ["production", "inventory", "requisitions", "recipes", "forecasting", "user_management", "settings", "reports", "batch_history", "review_queue", "purchase_orders", "view_costs"],
  admin: ["production", "inventory", "requisitions", "recipes", "forecasting", "user_management", "reports", "batch_history", "review_queue", "purchase_orders", "view_costs"],
  production_lead: ["production", "inventory", "requisitions", "recipes", "reports", "batch_history", "review_queue"],
  production_labor: ["production", "batch_history"],
  qc: ["review_queue", "batch_history", "inventory", "requisitions"],
  operator: ["production", "batch_history"],
  inventory: ["inventory", "requisitions", "batch_history"]
};

const ALL_PERMISSIONS = [
  "production", "inventory", "requisitions", "recipes", "forecasting", 
  "user_management", "settings", "reports", "batch_history", "review_queue", 
  "purchase_orders", "view_costs"
];

export default function UserManagement() {
  const { floorUser, hasPermission } = useFloorPin();
  const [showDialog, setShowDialog] = useState(false);
  const [appUser, setAppUser] = useState(null);

  // Check if main app user is admin
  useEffect(() => {
    base44.auth.me().then(setAppUser).catch(() => setAppUser(null));
  }, []);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({ name: "", pin: "", role: "operator", active: true });
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState(120);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "user" });
  const [inviting, setInviting] = useState(false);
  const [dashboardUsers, setDashboardUsers] = useState([]);
  const [showEditDashboardDialog, setShowEditDashboardDialog] = useState(false);
  const [editingDashboardUser, setEditingDashboardUser] = useState(null);
  const [dashboardEditForm, setDashboardEditForm] = useState({ full_name: "", role: "" });
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [rolePermissions, setRolePermissions] = useState(DEFAULT_ROLE_PERMISSIONS);
  const [editingPermissions, setEditingPermissions] = useState([]);
  const [showNewRoleDialog, setShowNewRoleDialog] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["floor_users"],
    queryFn: () => base44.entities.FloorUser.list()
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["app_settings"],
    queryFn: () => base44.entities.AppSettings.list()
  });

  // Fetch dashboard users (Base44 User entity)
  const { data: fetchedDashboardUsers = [], refetch: refetchDashboardUsers } = useQuery({
    queryKey: ["dashboard_users"],
    queryFn: () => base44.entities.User.list(),
    enabled: appUser?.role === "admin"
  });

  useEffect(() => {
    setDashboardUsers(fetchedDashboardUsers);
  }, [fetchedDashboardUsers]);

  // Load session timeout and role permissions from settings
  React.useEffect(() => {
    const timeoutSetting = settings.find(s => s.key === "session_timeout_minutes");
    if (timeoutSetting) {
      setSessionTimeout(parseInt(timeoutSetting.value));
    }
    const permissionsSetting = settings.find(s => s.key === "role_permissions");
    if (permissionsSetting) {
      try {
        setRolePermissions(JSON.parse(permissionsSetting.value));
      } catch (e) {
        setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
      }
    }
  }, [settings]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.FloorUser.create(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["floor_users"] });
      toast.success("User created");
      logAuditAction({
        action: "user_created",
        category: "user_management",
        description: `Created floor user "${variables.name}" with role ${variables.role}`,
        entityType: "FloorUser",
        newValue: { name: variables.name, role: variables.role },
        user: appUser || floorUser
      });
      setShowDialog(false);
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.FloorUser.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["floor_users"] });
      toast.success("User updated");
      logAuditAction({
        action: "user_updated",
        category: "user_management",
        description: `Updated floor user "${variables.data.name}"`,
        entityType: "FloorUser",
        entityId: variables.id,
        oldValue: editingUser ? { name: editingUser.name, role: editingUser.role, active: editingUser.active } : null,
        newValue: { name: variables.data.name, role: variables.data.role, active: variables.data.active },
        user: appUser || floorUser
      });
      setShowDialog(false);
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => {
      const userToDelete = users.find(u => u.id === id);
      return base44.entities.FloorUser.delete(id).then(() => userToDelete);
    },
    onSuccess: (deletedUser) => {
      queryClient.invalidateQueries({ queryKey: ["floor_users"] });
      toast.success("User deleted");
      logAuditAction({
        action: "user_deleted",
        category: "user_management",
        description: `Deleted floor user "${deletedUser?.name}"`,
        entityType: "FloorUser",
        oldValue: deletedUser ? { name: deletedUser.name, role: deletedUser.role } : null,
        user: appUser || floorUser
      });
    }
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (timeout) => {
      const existing = settings.find(s => s.key === "session_timeout_minutes");
      const oldValue = existing?.value;
      if (existing) {
        await base44.entities.AppSettings.update(existing.id, { value: String(timeout) });
      } else {
        await base44.entities.AppSettings.create({
          key: "session_timeout_minutes",
          value: String(timeout),
          description: "Session timeout in minutes"
        });
      }
      return { oldValue, newValue: timeout };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["app_settings"] });
      toast.success("Settings saved");
      logAuditAction({
        action: "settings_changed",
        category: "settings",
        description: `Changed session timeout from ${result.oldValue || 'default'} to ${result.newValue} minutes`,
        entityType: "AppSettings",
        oldValue: result.oldValue,
        newValue: result.newValue,
        user: appUser || floorUser
      });
      setShowSettingsDialog(false);
    }
  });

  const resetForm = () => {
    setForm({ name: "", pin: "", role: "operator", active: true });
    setEditingUser(null);
  };

  const openCreate = () => {
    resetForm();
    setShowDialog(true);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setForm({
      name: user.name,
      pin: user.pin,
      role: user.role,
      active: user.active
    });
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!form.name || !form.pin || form.pin.length !== 4) {
      toast.error("Name and 4-digit PIN required");
      return;
    }

    // Check for duplicate PIN
    const duplicate = users.find(u => u.pin === form.pin && u.id !== editingUser?.id);
    if (duplicate) {
      toast.error("PIN already in use");
      return;
    }

    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleDelete = (user) => {
    if (user.id === floorUser?.id) {
      toast.error("Cannot delete yourself");
      return;
    }
    if (confirm(`Delete user "${user.name}"?`)) {
      deleteMutation.mutate(user.id);
    }
  };

  const openEditDashboardUser = (user) => {
    setEditingDashboardUser(user);
    setDashboardEditForm({ full_name: user.full_name || "", role: user.role });
    setShowEditDashboardDialog(true);
  };

  const handleUpdateDashboardUser = async () => {
    if (!editingDashboardUser) return;
    
    try {
      await base44.entities.User.update(editingDashboardUser.id, dashboardEditForm);
      toast.success("Dashboard user updated");
      logAuditAction({
        action: "dashboard_user_updated",
        category: "user_management",
        description: `Updated dashboard user "${editingDashboardUser.email}" - role changed to ${dashboardEditForm.role}`,
        entityType: "User",
        entityId: editingDashboardUser.id,
        oldValue: { full_name: editingDashboardUser.full_name, role: editingDashboardUser.role },
        newValue: dashboardEditForm,
        user: appUser
      });
      setShowEditDashboardDialog(false);
      setEditingDashboardUser(null);
      refetchDashboardUsers();
    } catch (error) {
      toast.error(error.message || "Failed to update user");
    }
  };

  const handleDeleteDashboardUser = async (user) => {
    if (user.id === appUser?.id) {
      toast.error("Cannot delete yourself");
      return;
    }
    if (!confirm(`Delete dashboard user "${user.email}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await base44.entities.User.delete(user.id);
      toast.success("Dashboard user deleted");
      logAuditAction({
        action: "dashboard_user_deleted",
        category: "user_management",
        description: `Deleted dashboard user "${user.email}"`,
        entityType: "User",
        entityId: user.id,
        oldValue: { email: user.email, role: user.role },
        user: appUser
      });
      refetchDashboardUsers();
    } catch (error) {
      toast.error(error.message || "Failed to delete user");
    }
  };

  const openEditPermissions = (role) => {
    setEditingRole(role);
    setEditingPermissions([...(rolePermissions[role] || [])]);
    setShowPermissionsDialog(true);
  };

  const togglePermission = (permission) => {
    setEditingPermissions(prev => 
      prev.includes(permission) 
        ? prev.filter(p => p !== permission)
        : [...prev, permission]
    );
  };

  const handleSavePermissions = async () => {
    const updatedPermissions = { ...rolePermissions, [editingRole]: editingPermissions };
    const existing = settings.find(s => s.key === "role_permissions");
    const oldValue = rolePermissions[editingRole];
    
    try {
      if (existing) {
        await base44.entities.AppSettings.update(existing.id, { value: JSON.stringify(updatedPermissions) });
      } else {
        await base44.entities.AppSettings.create({
          key: "role_permissions",
          value: JSON.stringify(updatedPermissions),
          description: "Custom role permissions configuration"
        });
      }
      setRolePermissions(updatedPermissions);
      queryClient.invalidateQueries({ queryKey: ["app_settings"] });
      toast.success(`Permissions updated for ${editingRole}`);
      logAuditAction({
        action: "permissions_changed",
        category: "settings",
        description: `Updated permissions for role "${editingRole}"`,
        entityType: "AppSettings",
        oldValue: oldValue,
        newValue: editingPermissions,
        user: appUser || floorUser
      });
      setShowPermissionsDialog(false);
    } catch (error) {
      toast.error("Failed to save permissions");
    }
  };

  const handleCreateRole = async () => {
    const roleName = newRoleName.toLowerCase().trim().replace(/\s+/g, '_');
    if (!roleName) {
      toast.error("Role name is required");
      return;
    }
    if (rolePermissions[roleName]) {
      toast.error("Role already exists");
      return;
    }
    
    const updatedPermissions = { ...rolePermissions, [roleName]: [] };
    const existing = settings.find(s => s.key === "role_permissions");
    
    try {
      if (existing) {
        await base44.entities.AppSettings.update(existing.id, { value: JSON.stringify(updatedPermissions) });
      } else {
        await base44.entities.AppSettings.create({
          key: "role_permissions",
          value: JSON.stringify(updatedPermissions),
          description: "Custom role permissions configuration"
        });
      }
      setRolePermissions(updatedPermissions);
      queryClient.invalidateQueries({ queryKey: ["app_settings"] });
      toast.success(`Role "${roleName}" created`);
      logAuditAction({
        action: "role_created",
        category: "settings",
        description: `Created new role "${roleName}"`,
        entityType: "AppSettings",
        newValue: { roleName },
        user: appUser || floorUser
      });
      setShowNewRoleDialog(false);
      setNewRoleName("");
      // Open permissions dialog for the new role
      setEditingRole(roleName);
      setEditingPermissions([]);
      setShowPermissionsDialog(true);
    } catch (error) {
      toast.error("Failed to create role");
    }
  };

  const handleDeleteRole = async (role) => {
    if (['owner', 'admin', 'operator', 'inventory'].includes(role)) {
      toast.error("Cannot delete default roles");
      return;
    }
    if (!confirm(`Delete role "${role}"? Users with this role will need to be reassigned.`)) {
      return;
    }
    
    const { [role]: removed, ...updatedPermissions } = rolePermissions;
    const existing = settings.find(s => s.key === "role_permissions");
    
    try {
      await base44.entities.AppSettings.update(existing.id, { value: JSON.stringify(updatedPermissions) });
      setRolePermissions(updatedPermissions);
      queryClient.invalidateQueries({ queryKey: ["app_settings"] });
      toast.success(`Role "${role}" deleted`);
      logAuditAction({
        action: "role_deleted",
        category: "settings",
        description: `Deleted role "${role}"`,
        entityType: "AppSettings",
        oldValue: { roleName: role },
        user: appUser || floorUser
      });
    } catch (error) {
      toast.error("Failed to delete role");
    }
  };

  const handleInviteDashboardUser = async () => {
    if (!inviteForm.email || !inviteForm.email.includes("@")) {
      toast.error("Valid email address required");
      return;
    }
    
    // Only admins can invite admin users
    if (inviteForm.role === "admin" && appUser?.role !== "admin") {
      toast.error("Only admins can invite admin users");
      return;
    }

    setInviting(true);
    try {
      await base44.users.inviteUser(inviteForm.email, inviteForm.role);
      toast.success(`Invitation sent to ${inviteForm.email}`);
      logAuditAction({
        action: "dashboard_user_invited",
        category: "user_management",
        description: `Invited dashboard user "${inviteForm.email}" with role ${inviteForm.role}`,
        entityType: "User",
        newValue: { email: inviteForm.email, role: inviteForm.role },
        user: appUser
      });
      setShowInviteDialog(false);
      setInviteForm({ email: "", role: "user" });
      refetchDashboardUsers();
    } catch (error) {
      toast.error(error.message || "Failed to invite user");
    } finally {
      setInviting(false);
    }
  };

  // Check permission - allow if floor user has permission OR if main app user is admin
  const hasAccess = hasPermission("user_management") || appUser?.role === "admin";
  
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Shield className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-zinc-300">Access Denied</h2>
          <p className="text-zinc-500 mt-2">Only owners and admins can manage users</p>
        </div>
      </div>
    );
  }

  const roleColors = {
    owner: "orange",
    admin: "blue",
    production_lead: "cyan",
    production_labor: "green",
    qc: "purple",
    operator: "green",
    inventory: "purple"
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">User Management</h1>
          <p className="text-zinc-500 text-sm mt-1">Manage floor staff PINs and permissions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowSettingsDialog(true)}>
            <Clock className="w-4 h-4 mr-2" />
            Session Settings
          </Button>
          <Button onClick={openCreate} className="bg-orange-500 hover:bg-orange-600">
            <Plus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        </div>
      </div>

      {/* Users List */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-5 h-5" />
            Floor Users ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-zinc-500 text-center py-8">Loading...</p>
          ) : users.length === 0 ? (
            <p className="text-zinc-500 text-center py-8">No users yet. Add your first user above.</p>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    user.active
                      ? "bg-zinc-800/50 border-zinc-700"
                      : "bg-zinc-800/20 border-zinc-800 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                      <span className="text-orange-400 font-semibold">
                        {user.name?.[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-zinc-200">{user.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={roleColors[user.role]}>{user.role}</Badge>
                        <span className="text-xs text-zinc-500">PIN: ••••</span>
                        {!user.active && (
                          <Badge variant="red">Inactive</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {user.last_login && (
                      <span className="text-xs text-zinc-500 mr-4">
                        Last login: {new Date(user.last_login).toLocaleDateString()}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(user)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(user)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dashboard Users Section - Only visible to admins */}
      {appUser?.role === "admin" && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Dashboard Users ({dashboardUsers.length})
            </CardTitle>
            <Button 
              onClick={() => setShowInviteDialog(true)} 
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Invite User
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-zinc-500 text-sm mb-4">
              Dashboard users log in with email/password for higher-level access. All logins are recorded in the audit log.
            </p>
            {dashboardUsers.length === 0 ? (
              <p className="text-zinc-500 text-center py-4">No dashboard users yet.</p>
            ) : (
              <div className="space-y-3">
                {dashboardUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 rounded-lg border bg-zinc-800/50 border-zinc-700"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <Mail className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <p className="font-medium text-zinc-200">{user.full_name || user.email}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-zinc-500">{user.email}</span>
                          <Badge variant={user.role === "admin" ? "blue" : "green"}>
                            {user.role}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">
                        Joined: {new Date(user.created_date).toLocaleDateString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDashboardUser(user)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {user.id !== appUser?.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteDashboardUser(user)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Role Permissions Reference */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Role Permissions
          </CardTitle>
          {(floorUser?.role === "owner" || appUser?.role === "admin") && (
            <div className="flex items-center gap-3">
              <p className="text-xs text-zinc-500">Click a role to edit permissions</p>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => setShowNewRoleDialog(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                New Role
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(rolePermissions).map(([role, permissions]) => (
              <div 
                key={role} 
                className={`p-3 bg-zinc-800/50 rounded-lg border border-zinc-700 ${
                  (floorUser?.role === "owner" || appUser?.role === "admin") 
                    ? "cursor-pointer hover:border-orange-500/50 transition-colors" 
                    : ""
                }`}
                onClick={() => {
                  if (floorUser?.role === "owner" || appUser?.role === "admin") {
                    openEditPermissions(role);
                  }
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge variant={roleColors[role] || "default"}>{role}</Badge>
                  {(floorUser?.role === "owner" || appUser?.role === "admin") && (
                    <div className="flex items-center gap-1">
                      <Pencil className="w-3 h-3 text-zinc-500" />
                      {!['owner', 'admin', 'operator', 'inventory'].includes(role) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-red-400 hover:text-red-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRole(role);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <ul className="text-xs text-zinc-400 space-y-1">
                  {permissions.length === 0 ? (
                    <li className="text-zinc-600">No permissions</li>
                  ) : (
                    permissions.map((p) => (
                      <li key={p}>• {p.replace(/_/g, " ")}</li>
                    ))
                  )}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* User Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit User" : "Add User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Full name"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label>4-Digit PIN</Label>
              <Input
                type="password"
                maxLength={4}
                value={form.pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setForm({ ...form, pin: val });
                }}
                placeholder="••••"
                className="bg-zinc-800 border-zinc-700 text-center text-2xl tracking-widest"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(rolePermissions).map((role) => (
                    <SelectItem key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600"
            >
              <Save className="w-4 h-4 mr-2" />
              {editingUser ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dashboard User Dialog */}
      <Dialog open={showEditDashboardDialog} onOpenChange={setShowEditDashboardDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Edit Dashboard User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <p className="text-sm text-zinc-400">Email</p>
              <p className="text-zinc-200">{editingDashboardUser?.email}</p>
            </div>
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                value={dashboardEditForm.full_name}
                onChange={(e) => setDashboardEditForm({ ...dashboardEditForm, full_name: e.target.value })}
                placeholder="Full name"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select 
                value={dashboardEditForm.role} 
                onValueChange={(v) => setDashboardEditForm({ ...dashboardEditForm, role: v })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDashboardDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateDashboardUser}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Dashboard User Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Invite Dashboard User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Send an email invitation for secure email/password login access.
            </p>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                placeholder="user@example.com"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select 
                value={inviteForm.role} 
                onValueChange={(v) => setInviteForm({ ...inviteForm, role: v })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-zinc-500">
                Admins can manage all settings and invite other users. Users have limited access.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInviteDashboardUser}
              disabled={inviting}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Mail className="w-4 h-4 mr-2" />
              {inviting ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Permissions Dialog */}
      <Dialog open={showPermissionsDialog} onOpenChange={setShowPermissionsDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Edit {editingRole} Permissions
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {ALL_PERMISSIONS.map((permission) => (
              <div
                key={permission}
                className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg border border-zinc-700"
              >
                <span className="text-sm text-zinc-300 capitalize">
                  {permission.replace(/_/g, " ")}
                </span>
                <Checkbox
                  checked={editingPermissions.includes(permission)}
                  onCheckedChange={() => togglePermission(permission)}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPermissionsDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSavePermissions}
              className="bg-orange-500 hover:bg-orange-600"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Role Dialog */}
      <Dialog open={showNewRoleDialog} onOpenChange={setShowNewRoleDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Role Name</Label>
              <Input
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="e.g., supervisor, quality_control"
                className="bg-zinc-800 border-zinc-700"
              />
              <p className="text-xs text-zinc-500">
                Use lowercase letters, numbers, and underscores only.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewRoleDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateRole}
              className="bg-orange-500 hover:bg-orange-600"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Session Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Session Timeout (minutes)</Label>
              <Input
                type="number"
                min={15}
                max={480}
                value={sessionTimeout}
                onChange={(e) => setSessionTimeout(parseInt(e.target.value) || 120)}
                className="bg-zinc-800 border-zinc-700"
              />
              <p className="text-xs text-zinc-500">
                Users will be logged out after this many minutes of inactivity (15-480 min)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveSettingsMutation.mutate(sessionTimeout)}
              disabled={saveSettingsMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600"
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}