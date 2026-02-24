import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, User, Pencil, Trash2, ArrowLeft, Users, Plus, CheckCircle, XCircle } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

interface Voter {
  id: number;
  username: string;
  name: string;
  isAdmin: boolean;
  createdAt: string;
}

const updateVoterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z.string().min(3, "Username must be at least 3 characters"),
});

function useVoters() {
  return useQuery<Voter[]>({
    queryKey: [api.voters.list.path],
    queryFn: async () => {
      const res = await fetch(api.voters.list.path);
      if (!res.ok) throw new Error("Failed to fetch voters");
      return res.json();
    },
  });
}

function useUpdateVoter() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name?: string; username?: string } }) => {
      const res = await fetch(api.voters.update.path.replace(":id", String(id)), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update voter");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.voters.list.path] });
      toast({ title: "Voter updated successfully!" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update voter", description: err.message, variant: "destructive" });
    },
  });
}

function useDeleteVoter() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(api.voters.delete.path.replace(":id", String(id)), {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete voter");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.voters.list.path] });
      toast({ title: "Voter deleted successfully!" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete voter", description: err.message, variant: "destructive" });
    },
  });
}

interface VoterCardProps {
  voter: Voter;
  onEdit: (voter: Voter) => void;
  onDelete: (voter: Voter) => void;
}

function VoterCard({ voter, onEdit, onDelete }: VoterCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <User className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg">{voter.name}</h3>
              <p className="text-muted-foreground text-sm">@{voter.username}</p>
            </div>
          </div>
          <Badge variant={voter.isAdmin ? "default" : "secondary"} className="shrink-0">
            {voter.isAdmin ? "Admin" : "Voter"}
          </Badge>
        </div>

        <div className="mt-4 pt-4 border-t flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">Registered:</span>{" "}
            {voter.createdAt ? format(new Date(voter.createdAt), "MMM d, yyyy") : "N/A"}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(voter)}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => onDelete(voter)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface EditVoterDialogProps {
  voter: Voter | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EditVoterDialog({ voter, open, onOpenChange }: EditVoterDialogProps) {
  const updateVoter = useUpdateVoter();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof updateVoterSchema>>({
    resolver: zodResolver(updateVoterSchema),
    defaultValues: {
      name: voter?.name || "",
      username: voter?.username || "",
    },
  });

  // Reset form when voter changes
  useState(() => {
    if (voter) {
      form.reset({
        name: voter.name,
        username: voter.username,
      });
    }
  });

  const onSubmit = (values: z.infer<typeof updateVoterSchema>) => {
    if (!voter) return;
    updateVoter.mutate(
      { id: voter.id, data: values },
      {
        onSuccess: () => {
          onOpenChange(false);
          form.reset();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Voter</DialogTitle>
          <DialogDescription>Update voter information</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input placeholder="johndoe123" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateVoter.isPending}>
                {updateVoter.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteVoterDialogProps {
  voter: Voter | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DeleteVoterDialog({ voter, open, onOpenChange }: DeleteVoterDialogProps) {
  const deleteVoter = useDeleteVoter();
  const { toast } = useToast();

  const handleDelete = () => {
    if (!voter) return;
    deleteVoter.mutate(voter.id, {
      onSuccess: () => {
        onOpenChange(false);
        toast({ title: "Voter deleted", description: `${voter.name} has been removed.` });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Voter</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{voter?.name}</strong>? This action cannot be undone.
            All votes cast by this voter will also be removed.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteVoter.isPending}>
            {deleteVoter.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete Voter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminVoters() {
  const { data: voters, isLoading } = useVoters();
  const [searchQuery, setSearchQuery] = useState("");
  const [editVoter, setEditVoter] = useState<Voter | null>(null);
  const [deleteVoter, setDeleteVoter] = useState<Voter | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const filteredVoters = voters?.filter(
    (voter) =>
      voter.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      voter.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEdit = (voter: Voter) => {
    setEditVoter(voter);
    setEditDialogOpen(true);
  };

  const handleDelete = (voter: Voter) => {
    setDeleteVoter(voter);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/dashboard" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Manage Voters</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              View and manage voter accounts
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Voters</p>
              <p className="text-2xl font-bold">{voters?.length ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Accounts</p>
              <p className="text-2xl font-bold">{voters?.filter(v => !v.isAdmin).length ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Admins</p>
              <p className="text-2xl font-bold">{voters?.filter(v => v.isAdmin).length ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or username..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Voter List */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !filteredVoters || filteredVoters.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <h3 className="font-semibold mb-1">No Voters Found</h3>
            <p className="text-muted-foreground text-sm">
              {searchQuery ? "No voters match your search criteria." : "No voters have registered yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVoters.map((voter) => (
            <VoterCard key={voter.id} voter={voter} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <EditVoterDialog
        voter={editVoter}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
      <DeleteVoterDialog
        voter={deleteVoter}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </div>
  );
}
