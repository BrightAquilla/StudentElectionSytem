import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { ArrowLeft, Loader2, Lock, Plus, Search, ShieldX, Trash2, Unlock, Users } from "lucide-react";

const regNoRegex = /^[A-Z]{2}\d{2}\/PU\/\d{5}\/\d{2}$/i;

type Voter = {
  id: number;
  username: string;
  email: string;
  name: string;
  role: string;
  isAdmin: boolean;
  isDisabled: boolean;
  deletedAt: string | null;
  createdAt: string | null;
};

type RoleFilter = "all" | "voter" | "analyst" | "admin";
type SortOption = "created_desc" | "created_asc" | "name_asc" | "name_desc" | "role";

const createVoterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z.string().regex(regNoRegex, "Use format like SB30/PU/40239/20"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Password confirmation is required"),
}).refine((data) => data.password === data.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match",
});

const editVoterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z.string().regex(regNoRegex, "Use format like SB30/PU/40239/20"),
  email: z.string().email("Please enter a valid email address"),
});

const passwordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Password confirmation is required"),
}).refine((data) => data.password === data.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match",
});

function useVoters() {
  return useQuery<Voter[]>({
    queryKey: [api.voters.list.path],
    queryFn: async () => {
      const res = await fetch(api.voters.list.path);
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });
}

function useCreateVoter() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { name: string; username: string; email: string; password: string }) => {
      const res = await fetch(api.voters.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, username: data.username.toUpperCase() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to create voter");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.voters.list.path] });
      toast({ title: "Voter created successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create voter", description: err.message, variant: "destructive" });
    },
  });
}

function useUpdateVoter() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name: string; username: string; email: string } }) => {
      const res = await fetch(api.voters.update.path.replace(":id", String(id)), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, username: data.username.toUpperCase() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to update voter");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.voters.list.path] });
      toast({ title: "Voter updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });
}

function useSetVoterStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, isDisabled }: { id: number; isDisabled: boolean }) => {
      const res = await fetch(api.voters.setStatus.path.replace(":id", String(id)), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDisabled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to update voter status");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.voters.list.path] });
      toast({ title: variables.isDisabled ? "Voter disabled" : "Voter enabled" });
    },
    onError: (err: Error) => {
      toast({ title: "Status update failed", description: err.message, variant: "destructive" });
    },
  });
}

function useResetVoterPassword() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) => {
      const res = await fetch(api.voters.resetPassword.path.replace(":id", String(id)), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to reset password");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Password updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Password reset failed", description: err.message, variant: "destructive" });
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
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to delete voter");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.voters.list.path] });
      toast({ title: "Voter moved to deleted state" });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });
}

function useRestoreVoter() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(api.voters.restore.path.replace(":id", String(id)), {
        method: "PATCH",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to restore voter");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.voters.list.path] });
      toast({ title: "Voter restored" });
    },
    onError: (err: Error) => {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    },
  });
}

function usePermanentDeleteVoter() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(api.voters.permanentDelete.path.replace(":id", String(id)), {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to permanently delete voter");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.voters.list.path] });
      toast({ title: "Voter permanently deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Permanent delete failed", description: err.message, variant: "destructive" });
    },
  });
}

type CreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function CreateVoterDialog({ open, onOpenChange }: CreateDialogProps) {
  const createVoter = useCreateVoter();
  const form = useForm<z.infer<typeof createVoterSchema>>({
    resolver: zodResolver(createVoterSchema),
    defaultValues: {
      name: "",
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = (values: z.infer<typeof createVoterSchema>) => {
    const { confirmPassword, ...payload } = values;
    createVoter.mutate(
      { ...payload, username: payload.username.toUpperCase() },
      {
        onSuccess: () => {
          form.reset();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add voter</DialogTitle>
          <DialogDescription>Create a voter account manually.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="username" render={({ field }) => (
              <FormItem>
                <FormLabel>Registration number</FormLabel>
                <FormControl><Input {...field} placeholder="e.g. SB30/PU/40239/20" className="uppercase" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl><Input type="email" {...field} placeholder="student@pwani.ac.ke" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl><Input type="password" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="confirmPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm password</FormLabel>
                <FormControl><Input type="password" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={createVoter.isPending}>
                {createVoter.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add voter
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

type EditDialogProps = {
  voter: Voter | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function EditVoterDialog({ voter, open, onOpenChange }: EditDialogProps) {
  const updateVoter = useUpdateVoter();
  const form = useForm<z.infer<typeof editVoterSchema>>({
    resolver: zodResolver(editVoterSchema),
    defaultValues: { name: "", username: "", email: "" },
  });

  useEffect(() => {
    if (voter) {
      form.reset({ name: voter.name, username: voter.username, email: voter.email });
    }
  }, [voter, form]);

  const onSubmit = (values: z.infer<typeof editVoterSchema>) => {
    if (!voter) return;
    updateVoter.mutate(
      { id: voter.id, data: { ...values, username: values.username.toUpperCase() } },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit voter</DialogTitle>
          <DialogDescription>Update voter profile details.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="username" render={({ field }) => (
              <FormItem>
                <FormLabel>Registration number</FormLabel>
                <FormControl><Input {...field} className="uppercase" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl><Input type="email" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={updateVoter.isPending}>
                {updateVoter.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

type PasswordDialogProps = {
  voter: Voter | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function ResetPasswordDialog({ voter, open, onOpenChange }: PasswordDialogProps) {
  const resetPassword = useResetVoterPassword();
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = (values: z.infer<typeof passwordSchema>) => {
    if (!voter) return;
    resetPassword.mutate(
      { id: voter.id, password: values.password },
      {
        onSuccess: () => {
          form.reset();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for <strong>{voter?.name}</strong>.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl><Input type="password" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="confirmPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm password</FormLabel>
                <FormControl><Input type="password" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={resetPassword.isPending}>
                {resetPassword.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update password
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

type DeleteDialogProps = {
  voter: Voter | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function DeleteVoterDialog({ voter, open, onOpenChange }: DeleteDialogProps) {
  const deleteVoter = useDeleteVoter();

  const handleDelete = () => {
    if (!voter) return;
    deleteVoter.mutate(voter.id, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Soft delete voter</DialogTitle>
          <DialogDescription>
            This will soft-delete <strong>{voter?.name}</strong> and block login.
            You can restore them later, or permanently delete from the table row action.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteVoter.isPending}>
            {deleteVoter.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Soft Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminVoters() {
  const { data: voters, isLoading } = useVoters();
  const setVoterStatus = useSetVoterStatus();
  const restoreVoter = useRestoreVoter();
  const permanentDeleteVoter = usePermanentDeleteVoter();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("created_desc");
  const [editVoter, setEditVoter] = useState<Voter | null>(null);
  const [passwordVoter, setPasswordVoter] = useState<Voter | null>(null);
  const [deleteVoter, setDeleteVoter] = useState<Voter | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const filteredVoters = useMemo(() => {
    if (!voters) return [];

    const roleOf = (user: Voter) => (user.isAdmin || user.role === "admin" ? "admin" : user.role);

    let list = voters.filter((voter) =>
      voter.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      voter.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      voter.email.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    if (roleFilter !== "all") {
      list = list.filter((user) => roleOf(user) === roleFilter);
    }

    const roleRank: Record<string, number> = { admin: 0, analyst: 1, voter: 2 };
    list.sort((a, b) => {
      switch (sortBy) {
        case "created_asc":
          return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
        case "name_asc":
          return a.name.localeCompare(b.name);
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "role":
          return (roleRank[roleOf(a)] ?? 99) - (roleRank[roleOf(b)] ?? 99);
        case "created_desc":
        default:
          return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
      }
    });

    return list;
  }, [voters, searchQuery, roleFilter, sortBy]);
  const canManageUser = (user: Voter) => !(user.isAdmin || user.role === "admin");

  const total = voters?.length ?? 0;
  const voterCount = voters?.filter((voter) => voter.role === "voter").length ?? 0;
  const analystCount = voters?.filter((voter) => voter.role === "analyst").length ?? 0;
  const adminCount = voters?.filter((voter) => voter.isAdmin || voter.role === "admin").length ?? 0;
  const disabledCount = voters?.filter((voter) => voter.isDisabled || !!voter.deletedAt).length ?? 0;
  const activeCount = total - disabledCount;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/admin/dashboard" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Manage Users</h1>
            <p className="text-sm text-muted-foreground">View all users (voters, analysts, admins). Voter controls remain voter-only.</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Voter
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total users</p><p className="text-2xl font-bold">{total}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Voters</p><p className="text-2xl font-bold">{voterCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Analysts</p><p className="text-2xl font-bold">{analystCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Admins</p><p className="text-2xl font-bold">{adminCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Active</p><p className="text-2xl font-bold text-green-600">{activeCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Disabled</p><p className="text-2xl font-bold text-red-600">{disabledCount}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />User list</CardTitle>
          <CardDescription>Search and manage accounts. Voter and analyst accounts are fully manageable.</CardDescription>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name, username/registration number, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            >
              <option value="all">All Roles</option>
              <option value="voter">Voters</option>
              <option value="analyst">Analysts</option>
              <option value="admin">Admins</option>
            </select>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
            >
              <option value="created_desc">Newest First</option>
              <option value="created_asc">Oldest First</option>
              <option value="name_asc">Name A-Z</option>
              <option value="name_desc">Name Z-A</option>
              <option value="role">Role (Admin-Analyst-Voter)</option>
            </select>
          </div>
          <div className="text-xs text-muted-foreground">
            Showing {filteredVoters.length} of {total} users
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filteredVoters.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No voters found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Username / Reg No</th>
                    <th className="py-2 pr-4 font-medium">Role</th>
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Registered</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVoters.map((voter) => (
                    <tr key={voter.id} className="border-b align-top">
                      <td className="py-3 pr-4 font-medium">{voter.name}</td>
                      <td className="py-3 pr-4">{voter.username}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="secondary">
                          {voter.isAdmin ? "admin" : voter.role}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">{voter.email}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={voter.deletedAt ? "destructive" : voter.isDisabled ? "destructive" : "secondary"}>
                          {voter.deletedAt ? "Deleted" : voter.isDisabled ? "Disabled" : "Active"}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">{voter.createdAt ? format(new Date(voter.createdAt), "MMM d, yyyy") : "N/A"}</td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!!voter.deletedAt || !canManageUser(voter)}
                            onClick={() => { setEditVoter(voter); setEditOpen(true); }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!!voter.deletedAt || !canManageUser(voter)}
                            onClick={() => { setPasswordVoter(voter); setPasswordOpen(true); }}
                          >
                            <Lock className="mr-1 h-4 w-4" />Password
                          </Button>
                          <Button
                            variant={voter.isDisabled ? "default" : "destructive"}
                            size="sm"
                            disabled={setVoterStatus.isPending || !!voter.deletedAt || !canManageUser(voter)}
                            onClick={() => setVoterStatus.mutate({ id: voter.id, isDisabled: !voter.isDisabled })}
                          >
                            {voter.isDisabled ? <><Unlock className="mr-1 h-4 w-4" />Enable</> : <><ShieldX className="mr-1 h-4 w-4" />Disable</>}
                          </Button>
                          <Button
                            variant={voter.deletedAt ? "default" : "destructive"}
                            size="sm"
                            disabled={!canManageUser(voter)}
                            onClick={() => {
                              if (voter.deletedAt) {
                                restoreVoter.mutate(voter.id);
                              } else {
                                setDeleteVoter(voter);
                                setDeleteOpen(true);
                              }
                            }}
                          >
                            <Trash2 className="mr-1 h-4 w-4" />
                            {voter.deletedAt ? "Restore" : "Soft Delete"}
                          </Button>
                          {voter.deletedAt && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={!canManageUser(voter)}
                              onClick={() => permanentDeleteVoter.mutate(voter.id)}
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              Permanent Delete
                            </Button>
                          )}
                          {voter.deletedAt && (
                            <div className="w-full text-xs text-muted-foreground mt-1">
                              Deleted at {format(new Date(voter.deletedAt), "MMM d, yyyy p")}
                            </div>
                          )}
                          {!voter.deletedAt && canManageUser(voter) && (
                            <div className="w-full text-xs text-muted-foreground mt-1">
                              Soft delete allows restore later.
                            </div>
                          )}
                          {!canManageUser(voter) && (
                            <div className="w-full text-xs text-muted-foreground mt-1">
                              This is a {voter.isAdmin ? "system admin" : voter.role} account. View-only in this section.
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateVoterDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditVoterDialog voter={editVoter} open={editOpen} onOpenChange={setEditOpen} />
      <ResetPasswordDialog voter={passwordVoter} open={passwordOpen} onOpenChange={setPasswordOpen} />
      <DeleteVoterDialog voter={deleteVoter} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
}
