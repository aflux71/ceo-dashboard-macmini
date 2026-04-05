import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  ChevronRight,
  AlertTriangle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { toast } from "sonner";
import AssemblyGuideEditor from "@/components/assembly/AssemblyGuideEditor";
import AssemblyGuideDisplay from "@/components/assembly/AssemblyGuideDisplay";
import PhotoCaptureMode from "@/components/inventory/PhotoCaptureMode";

export default function AssemblyGuides() {
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedGuide, setSelectedGuide] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [showPhotoCaptureMode, setShowPhotoCaptureMode] = useState(false);

  const queryClient = useQueryClient();

  const { data: guides = [], isLoading: guidesLoading } = useQuery({
    queryKey: ['assembly_guides'],
    queryFn: () => base44.entities.AssemblyGuide.list('-created_date'),
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.list(),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => base44.entities.Inventory.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => {
      const recipe = recipes.find(r => r.id === data.recipe_id);
      return base44.entities.AssemblyGuide.create({
        recipe_id: data.recipe_id,
        product_name: recipe?.name || "",
        sku: recipe?.sku || "",
        components: data.components,
        assembly_notes: data.assembly_notes,
        updated_by: "User"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assembly_guides'] });
      toast.success("Assembly guide created");
      setShowCreateModal(false);
      setSelectedRecipe(null);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => {
      return base44.entities.AssemblyGuide.update(id, {
        components: data.components,
        assembly_notes: data.assembly_notes,
        updated_by: "User"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assembly_guides'] });
      toast.success("Assembly guide updated");
      setShowEditModal(false);
      setSelectedGuide(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.AssemblyGuide.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assembly_guides'] });
      toast.success("Assembly guide deleted");
    }
  });

  const handleCreateGuide = (data) => {
    createMutation.mutate({
      recipe_id: selectedRecipe.id,
      ...data
    });
  };

  const handleUpdateGuide = (data) => {
    updateMutation.mutate({
      id: selectedGuide.id,
      data
    });
  };

  const filtered = guides.filter(guide => {
    return !search ||
      guide.product_name?.toLowerCase().includes(search.toLowerCase()) ||
      guide.sku?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Assembly Guides</h1>
          <p className="text-zinc-500 text-sm mt-1">Visual reference for packaging assembly</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="bg-orange-500 hover:bg-orange-600">
          <Plus className="w-4 h-4 mr-2" />
          New Guide
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          placeholder="Search by product name or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-zinc-900 border-zinc-800"
        />
      </div>

      {/* Guides List */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-0">
          {guidesLoading ? (
            <p className="text-center text-zinc-500 py-8">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-zinc-500 py-8">
              {guides.length === 0 ? "No assembly guides yet" : "No matches found"}
            </p>
          ) : (
            <div className="divide-y divide-zinc-800">
              {filtered.map((guide) => {
                const missingPhotos = guide.components?.filter(comp => {
                  const inv = inventory.find(i => i.id === comp.inventory_item_id);
                  return !inv?.component_photo;
                }).length || 0;

                return (
                  <div
                    key={guide.id}
                    className="p-4 hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-mono text-sm text-orange-400">{guide.sku}</span>
                          <span className="font-semibold text-zinc-100">{guide.product_name}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-zinc-400">
                          <span>{guide.components?.length || 0} components</span>
                          {missingPhotos > 0 && (
                            <div className="flex items-center gap-1 text-amber-400">
                              <AlertTriangle className="w-3 h-3" />
                              {missingPhotos} missing photo{missingPhotos > 1 ? "s" : ""}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedGuide(guide);
                            setShowViewModal(true);
                          }}
                          className="text-zinc-400 hover:text-zinc-100"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedGuide(guide);
                            setShowEditModal(true);
                          }}
                          className="text-zinc-400 hover:text-zinc-100"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Delete this assembly guide?")) {
                              deleteMutation.mutate(guide.id);
                            }
                          }}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Guide Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Assembly Guide</DialogTitle>
          </DialogHeader>

          {!selectedRecipe ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">Select a recipe to create a guide for:</p>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {recipes
                  .filter(r => r.active !== false && !guides.find(g => g.recipe_id === r.id))
                  .map((recipe) => (
                    <Button
                      key={recipe.id}
                      onClick={() => setSelectedRecipe(recipe)}
                      variant="outline"
                      className="w-full justify-between h-auto py-3 px-4"
                    >
                      <div className="flex flex-col items-start">
                        <span className="font-mono text-sm text-orange-400">{recipe.sku}</span>
                        <span className="text-zinc-200 font-medium">{recipe.name}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-500" />
                    </Button>
                  ))}
              </div>
            </div>
          ) : (
            <AssemblyGuideEditor
              guide={null}
              inventory={inventory}
              onSave={handleCreateGuide}
              onCancel={() => setSelectedRecipe(null)}
              onOpenPhotoCaptureMode={() => {
                setShowCreateModal(false);
                setShowPhotoCaptureMode(true);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* View Guide Modal */}
      <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedGuide?.product_name}</DialogTitle>
          </DialogHeader>
          {selectedGuide && (
            <AssemblyGuideDisplay
              guide={selectedGuide}
              inventory={inventory}
              onPrint={() => window.print()}
              onEdit={() => {
                setShowViewModal(false);
                setShowEditModal(true);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Guide Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Assembly Guide</DialogTitle>
          </DialogHeader>
          {selectedGuide && (
            <AssemblyGuideEditor
              guide={selectedGuide}
              inventory={inventory}
              onSave={handleUpdateGuide}
              onCancel={() => setShowEditModal(false)}
              onOpenPhotoCaptureMode={() => {
                setShowEditModal(false);
                setShowPhotoCaptureMode(true);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Photo Capture Mode */}
      <PhotoCaptureMode
        open={showPhotoCaptureMode}
        onClose={() => setShowPhotoCaptureMode(false)}
        inventory={inventory}
      />
    </div>
  );
}