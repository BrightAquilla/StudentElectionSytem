import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { api } from "@shared/routes";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type Party = {
  id: number;
  code: string;
  name: string;
  symbol: string;
  manifesto: string;
  createdAt: string | Date | null;
};

type PartyForm = {
  code: string;
  name: string;
  symbol: string;
  manifesto: string;
};

const emptyForm: PartyForm = {
  code: "",
  name: "",
  symbol: "",
  manifesto: "",
};

export default function AdminParties() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createForm, setCreateForm] = useState<PartyForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<PartyForm>(emptyForm);

  const { data: parties = [], isLoading } = useQuery<Party[]>({
    queryKey: [api.parties.list.path, "admin-manage"],
    queryFn: async () => {
      const res = await fetch(api.parties.list.path);
      if (!res.ok) throw new Error("Failed to load parties");
      return api.parties.list.responses[200].parse(await res.json());
    },
  });

  const invalidateParties = () => {
    queryClient.invalidateQueries({ queryKey: [api.parties.list.path] });
  };

  const createParty = useMutation({
    mutationFn: async (form: PartyForm) => {
      const res = await fetch(api.parties.create.path, {
        method: api.parties.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim().toLowerCase(),
          name: form.name.trim(),
          symbol: form.symbol.trim(),
          manifesto: form.manifesto.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to create party");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateParties();
      setCreateForm(emptyForm);
      toast({ title: "Party created" });
    },
    onError: (error: Error) => {
      toast({ title: "Create failed", description: error.message, variant: "destructive" });
    },
  });

  const updateParty = useMutation({
    mutationFn: async ({ id, form }: { id: number; form: PartyForm }) => {
      const res = await fetch(api.parties.update.path.replace(":id", String(id)), {
        method: api.parties.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim().toLowerCase(),
          name: form.name.trim(),
          symbol: form.symbol.trim(),
          manifesto: form.manifesto.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to update party");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateParties();
      setEditingId(null);
      setEditForm(emptyForm);
      toast({ title: "Party updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteParty = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(api.parties.delete.path.replace(":id", String(id)), {
        method: api.parties.delete.method,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to delete party");
      }
    },
    onSuccess: () => {
      invalidateParties();
      toast({ title: "Party deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!editingId) return;
    const target = parties.find((party) => party.id === editingId);
    if (!target) {
      setEditingId(null);
      setEditForm(emptyForm);
      return;
    }
    setEditForm({
      code: target.code,
      name: target.name,
      symbol: target.symbol,
      manifesto: target.manifesto,
    });
  }, [editingId, parties]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/dashboard" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Manage Parties</h1>
          <p className="text-sm text-muted-foreground">Create and maintain the party registry used by candidate registration and candidate applications.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Party</CardTitle>
          <CardDescription>Create a new party entry for the system-wide candidate registry.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              placeholder="Code (e.g. unity-forward)"
              value={createForm.code}
              onChange={(e) => setCreateForm((current) => ({ ...current, code: e.target.value }))}
            />
            <Input
              placeholder="Party name"
              value={createForm.name}
              onChange={(e) => setCreateForm((current) => ({ ...current, name: e.target.value }))}
            />
            <Input
              placeholder="Symbol"
              value={createForm.symbol}
              onChange={(e) => setCreateForm((current) => ({ ...current, symbol: e.target.value }))}
            />
          </div>
          <Textarea
            className="min-h-[120px]"
            placeholder="Party manifesto"
            value={createForm.manifesto}
            onChange={(e) => setCreateForm((current) => ({ ...current, manifesto: e.target.value }))}
          />
          <Button
            onClick={() => createParty.mutate(createForm)}
            disabled={createParty.isPending || !createForm.code.trim() || !createForm.name.trim() || !createForm.symbol.trim() || createForm.manifesto.trim().length < 20}
          >
            {createParty.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add Party
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registered Parties</CardTitle>
          <CardDescription>These entries power all party dropdowns in the platform.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : parties.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No parties available.</div>
          ) : (
            <div className="space-y-4">
              {parties.map((party) => {
                const isEditing = editingId === party.id;
                const activeForm = isEditing ? editForm : {
                  code: party.code,
                  name: party.name,
                  symbol: party.symbol,
                  manifesto: party.manifesto,
                };

                return (
                  <div key={party.id} className="rounded-xl border p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Input
                        value={activeForm.code}
                        readOnly={!isEditing}
                        onChange={(e) => setEditForm((current) => ({ ...current, code: e.target.value }))}
                      />
                      <Input
                        value={activeForm.name}
                        readOnly={!isEditing}
                        onChange={(e) => setEditForm((current) => ({ ...current, name: e.target.value }))}
                      />
                      <Input
                        value={activeForm.symbol}
                        readOnly={!isEditing}
                        onChange={(e) => setEditForm((current) => ({ ...current, symbol: e.target.value }))}
                      />
                    </div>
                    <Textarea
                      className="min-h-[120px]"
                      value={activeForm.manifesto}
                      readOnly={!isEditing}
                      onChange={(e) => setEditForm((current) => ({ ...current, manifesto: e.target.value }))}
                    />
                    <div className="flex flex-wrap gap-2">
                      {isEditing ? (
                        <>
                          <Button
                            onClick={() => updateParty.mutate({ id: party.id, form: editForm })}
                            disabled={updateParty.isPending || !editForm.code.trim() || !editForm.name.trim() || !editForm.symbol.trim() || editForm.manifesto.trim().length < 20}
                          >
                            {updateParty.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save
                          </Button>
                          <Button variant="outline" onClick={() => { setEditingId(null); setEditForm(emptyForm); }}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button variant="outline" onClick={() => setEditingId(party.id)}>
                          Edit
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        onClick={() => deleteParty.mutate(party.id)}
                        disabled={deleteParty.isPending}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
