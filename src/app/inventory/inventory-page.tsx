"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  Box,
  ChevronRight,
  CircleDot,
  Cog,
  ExternalLink,
  Link2,
  LoaderCircle,
  MapPin,
  Minus,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModalBackdrop } from "@/components/modal-backdrop";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useAuth } from "@/context/auth-context";
import {
  adjustInventoryQuantity,
  createInventoryItem,
  deleteInventoryItem,
  updateInventoryItem,
  type InventoryItemInput,
} from "@/lib/inventory-actions";
import { useInventory } from "@/lib/hooks";
import type { InventoryCategory, InventoryItem, InventorySpecs } from "@/types";

type CategoryFilter = "all" | InventoryCategory;
type StockFilter = "all" | "available" | "low" | "out";

const CATEGORY_META: Record<InventoryCategory, { label: string; icon: ReactNode }> = {
  gear: { label: "Gears", icon: <Cog size={15} /> },
  pulley: { label: "Pulleys", icon: <CircleDot size={15} /> },
  sprocket: { label: "Sprockets", icon: <Cog size={15} /> },
  belt: { label: "Belts", icon: <Link2 size={15} /> },
};

const BORE_OPTIONS = [
  '1/2" hex',
  '3/8" hex',
  "15T spline",
  "Falcon pinion",
  "Bearing bore",
  "MAXSpline bore",
];
const BELT_PROFILE_OPTIONS = ["3mm GT2", "5mm HTD"];
const WIDTH_OPTIONS = ["9", "15"];
const CHAIN_OPTIONS = ["#25", "#35"];

export default function InventoryPage() {
  const { firebaseUser, profile, actualProfile, isCoach } = useAuth();
  const { items, loading, error } = useInventory();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [stock, setStock] = useState<StockFilter>("all");
  const [standard, setStandard] = useState("all");
  const [bore, setBore] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<InventoryItem | "new" | null>(null);
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InventoryItem | null>(null);

  const standards = useMemo(
    () => unique(items.flatMap((item) => [item.specs.beltProfile, item.specs.chainSize])),
    [items],
  );
  const bores = useMemo(() => unique(items.map((item) => item.specs.bore)), [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return items.filter((item) => {
      const isLow = item.quantity > 0 && item.quantity <= item.minimumQuantity;
      if (category !== "all" && item.category !== category) return false;
      if (stock === "available" && item.quantity <= 0) return false;
      if (stock === "low" && !isLow) return false;
      if (stock === "out" && item.quantity !== 0) return false;
      if (standard !== "all" && ![item.specs.beltProfile, item.specs.chainSize].includes(standard)) return false;
      if (bore !== "all" && item.specs.bore !== bore) return false;
      if (!term) return true;
      return searchableValues(item).some((value) => value.toLocaleLowerCase().includes(term));
    });
  }, [bore, category, items, search, standard, stock]);

  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  const lowCount = items.filter((item) => item.quantity <= item.minimumQuantity).length;
  const filtersActive = category !== "all" || stock !== "all" || standard !== "all" || bore !== "all" || search !== "";

  const actor = firebaseUser && profile
    ? { uid: firebaseUser.uid, name: actualProfile?.displayName ?? profile.displayName }
    : null;

  async function removeItem(item: InventoryItem) {
    setActionError(null);
    try {
      await deleteInventoryItem(item.id);
      setSelectedId(null);
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "Item could not be deleted.");
    }
  }

  function clearFilters() {
    setSearch("");
    setCategory("all");
    setStock("all");
    setStandard("all");
    setBore("all");
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Hardware inventory</h1>
            <p className="mt-1 max-w-2xl text-sm text-steel">
              Find drivetrain hardware, see what is on hand, and keep bin counts current.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <div className="grid grid-cols-3 overflow-hidden rounded border border-steel-line bg-paper-raised">
              <Stat label="Part types" value={items.length} />
              <Stat label="Units" value={totalUnits} />
              <Stat label="Low / out" value={lowCount} attention={lowCount > 0} />
            </div>
            <button className="btn-primary inline-flex items-center justify-center gap-2" onClick={() => setEditing("new")}>
              <PackagePlus size={16} /> Add hardware
            </button>
          </div>
        </header>

        <section className="mb-4 space-y-3 rounded border border-steel-line bg-paper-raised p-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(20rem,1fr)_auto] xl:items-center">
            <label className="relative block">
              <span className="sr-only">Search inventory</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-steel" size={18} />
              <input
                className="input input-with-icon h-11 text-base"
                placeholder="Search name, bore, pitch, part number, or location…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="grid grid-cols-5 overflow-hidden rounded border border-steel-line bg-surface">
              {(["all", "gear", "pulley", "sprocket", "belt"] as CategoryFilter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`tracked-label px-2.5 py-3 text-[9px] font-bold transition-colors sm:text-[10px] ${category === value ? "bg-blueprint text-white" : "text-steel hover:bg-paper hover:text-ink"}`}
                  onClick={() => setCategory(value)}
                >
                  {value === "all" ? "All" : CATEGORY_META[value].label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-[12rem_14rem_14rem_1fr] lg:items-center">
            <FilterSelect label="Stock status" value={stock} onChange={(value) => setStock(value as StockFilter)}>
              <option value="all">Any stock status</option>
              <option value="available">Available now</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
            </FilterSelect>
            <FilterSelect label="Drive standard" value={standard} onChange={setStandard}>
              <option value="all">Any belt / chain type</option>
              {standards.map((value) => <option key={value}>{value}</option>)}
            </FilterSelect>
            <FilterSelect label="Bore" value={bore} onChange={setBore}>
              <option value="all">Any bore</option>
              {bores.map((value) => <option key={value}>{value}</option>)}
            </FilterSelect>
            <div className="flex items-center justify-between gap-3 px-1 text-xs text-steel">
              <span><strong className="font-semibold text-ink">{filtered.length}</strong> matching part {filtered.length === 1 ? "type" : "types"}</span>
              {filtersActive && (
                <button className="inline-flex items-center gap-1 font-medium text-blueprint hover:underline" onClick={clearFilters}>
                  <X size={13} /> Clear filters
                </button>
              )}
            </div>
          </div>
        </section>

        {(error || actionError) && (
          <div className="mb-4 rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error ?? actionError}
          </div>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(340px,0.92fr)_minmax(0,1.35fr)]">
          <section className="overflow-hidden rounded border border-steel-line bg-paper-raised">
            <div className="flex items-center justify-between border-b border-steel-line px-4 py-3">
              <h2 className="tracked-label text-[10px] font-bold text-steel">Inventory</h2>
              <span className="font-mono text-[11px] text-steel">{filtered.length} records</span>
            </div>
            {loading ? (
              <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-steel">
                <LoaderCircle className="animate-spin" size={17} /> Loading inventory…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex min-h-60 flex-col items-center justify-center px-8 text-center">
                <Box className="mb-3 text-steel" size={28} />
                <p className="font-semibold">No hardware matches</p>
                <p className="mt-1 max-w-sm text-sm text-steel">
                  {items.length === 0 ? "Add the first item to start your team inventory." : "Try a broader search or clear the current filters."}
                </p>
                <button className="btn-secondary mt-4" onClick={items.length === 0 ? () => setEditing("new") : clearFilters}>
                  {items.length === 0 ? "Add hardware" : "Clear filters"}
                </button>
              </div>
            ) : (
              <div className="max-h-[38rem] divide-y divide-steel-line overflow-y-auto">
                {filtered.map((item) => (
                  <InventoryRow key={item.id} item={item} selected={selected?.id === item.id} onSelect={() => setSelectedId(item.id)} />
                ))}
              </div>
            )}
          </section>

          <section className="min-h-80 overflow-hidden rounded border border-steel-line bg-paper-raised lg:sticky lg:top-4">
            {selected ? (
              <InventoryDetail
                item={selected}
                isCoach={isCoach}
                onAdjust={() => setAdjusting(selected)}
                onEdit={() => setEditing(selected)}
              onDelete={() => setPendingDelete(selected)}
              />
            ) : (
              <div className="flex min-h-80 flex-col items-center justify-center px-8 text-center text-steel">
                <CircleDot className="mb-3" size={30} />
                <p className="text-sm">Select an inventory item to see specifications and stock controls.</p>
              </div>
            )}
          </section>
        </div>
      </div>

      {editing && actor && (
        <ItemDialog
          item={editing === "new" ? null : editing}
          actor={actor}
          existingItems={items}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setSelectedId(id);
            setEditing(null);
          }}
        />
      )}
      {adjusting && actor && (
        <AdjustDialog item={adjusting} actor={actor} onClose={() => setAdjusting(null)} />
      )}
      {pendingDelete && <ConfirmDialog title="Delete inventory item?" description={`Permanently delete ${pendingDelete.name}? This cannot be undone.`} confirmLabel="Delete item" destructive onConfirm={() => removeItem(pendingDelete)} onClose={() => setPendingDelete(null)} />}
    </AppShell>
  );
}

function InventoryRow({ item, selected, onSelect }: { item: InventoryItem; selected: boolean; onSelect: () => void }) {
  const low = item.quantity > 0 && item.quantity <= item.minimumQuantity;
  const out = item.quantity === 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group grid w-full grid-cols-[1fr_auto] gap-3 px-4 py-3.5 text-left transition-colors ${selected ? "bg-blueprint/8 shadow-[inset_3px_0_0_var(--blueprint)]" : "hover:bg-paper"}`}
    >
      <div className="min-w-0">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <CategoryBadge category={item.category} />
          {(low || out) && (
            <span className={`tracked-label inline-flex items-center gap-1 text-[8px] font-bold ${out ? "text-danger" : "text-hazard"}`}>
              <AlertTriangle size={10} /> {out ? "Out" : "Low"}
            </span>
          )}
        </div>
        <h3 className="truncate text-sm font-semibold" title={item.name}>{item.name}</h3>
        <p className="mt-1 truncate font-mono text-[10px] text-steel" title={formatSpecs(item)}>{formatSpecs(item)}</p>
        {item.location && <p className="mt-2 flex items-center gap-1 text-[11px] text-steel"><MapPin size={11} /> {item.location}</p>}
      </div>
      <div className="flex items-center gap-2 self-center">
        <div className="text-right">
          <p className={`text-2xl font-semibold tabular-nums ${out ? "text-danger" : low ? "text-hazard" : "text-ink"}`}>{item.quantity}</p>
          <p className="tracked-label text-[8px] text-steel">on hand</p>
        </div>
        <ChevronRight className={selected ? "text-blueprint" : "text-steel"} size={16} />
      </div>
    </button>
  );
}

function InventoryDetail({ item, isCoach, onAdjust, onEdit, onDelete }: {
  item: InventoryItem;
  isCoach: boolean;
  onAdjust: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const low = item.quantity <= item.minimumQuantity;
  return (
    <>
      <div className="border-b border-steel-line bg-surface px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CategoryBadge category={item.category} />
            <h2 className="mt-2 text-xl font-semibold tracking-tight">{item.name}</h2>
            <p className="mt-1 font-mono text-xs text-steel">{formatSpecs(item)}</p>
          </div>
          <div className={`min-w-28 rounded border px-4 py-2 text-center ${low ? "border-hazard/50 bg-hazard/10" : "border-success/40 bg-success/10"}`}>
            <p className={`text-3xl font-semibold tabular-nums ${low ? "text-hazard" : "text-success"}`}>{item.quantity}</p>
            <p className="tracked-label text-[8px] font-bold text-steel">units on hand</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn-primary inline-flex items-center gap-2" onClick={onAdjust}><Plus size={15} /> Adjust stock</button>
          <button className="btn-secondary inline-flex items-center gap-2" onClick={onEdit}><Pencil size={14} /> Edit details</button>
          {isCoach && <button className="btn-secondary ml-auto inline-flex items-center gap-2 text-danger" onClick={onDelete}><Trash2 size={14} /> Delete</button>}
        </div>
      </div>
      <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-2">
        <DetailGroup title="Specifications">
          {specRows(item).map(([label, value]) => <DetailRow key={label} label={label} value={value} />)}
        </DetailGroup>
        <DetailGroup title="Stock & sourcing">
          <DetailRow label="Location" value={item.location || "Not recorded"} />
          <DetailRow label="Restock at" value={`${item.minimumQuantity} units`} />
          <DetailRow label="Manufacturer" value={item.manufacturer || "Not recorded"} />
          <DetailRow label="Part number" value={item.partNumber || "Not recorded"} mono />
          {item.vendorUrl && (
            <a href={item.vendorUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-blueprint hover:underline">
              Open supplier page <ExternalLink size={12} />
            </a>
          )}
        </DetailGroup>
        {item.notes && (
          <div className="xl:col-span-2">
            <p className="tracked-label mb-2 text-[9px] font-bold text-steel">Notes</p>
            <p className="rounded border border-steel-line bg-surface p-3 text-sm leading-relaxed text-ink">{item.notes}</p>
          </div>
        )}
        <p className="text-[10px] text-steel xl:col-span-2">
          Last updated {formatDate(item.updatedAt)} by {item.updatedBy?.name ?? "a team member"}
        </p>
      </div>
    </>
  );
}

function ItemDialog({ item, actor, existingItems, onClose, onSaved }: {
  item: InventoryItem | null;
  actor: { uid: string; name: string };
  existingItems: InventoryItem[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState(() => formFromItem(item));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existingBores = unique([...BORE_OPTIONS, ...existingItems.map((entry) => entry.specs.bore)]);
  const existingProfiles = unique([...BELT_PROFILE_OPTIONS, ...existingItems.map((entry) => entry.specs.beltProfile)]);
  const existingWidths = unique([...WIDTH_OPTIONS, ...existingItems.map((entry) => entry.specs.widthMm)]);
  const existingChains = unique([...CHAIN_OPTIONS, ...existingItems.map((entry) => entry.specs.chainSize)]);

  function setField<K extends keyof ItemForm>(key: K, value: ItemForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const quantity = Number(form.quantity);
    const minimumQuantity = Number(form.minimumQuantity);
    if (!form.name.trim()) {
      setError("Enter a name for this hardware.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 0 || !Number.isInteger(minimumQuantity) || minimumQuantity < 0) {
      setError("Quantity and restock level must be non-negative whole numbers.");
      return;
    }
    if ((form.toothCount && !positiveWholeNumber(form.toothCount)) || (form.pitchLengthMm && Number(form.pitchLengthMm) <= 0)) {
      setError("Teeth must be a whole number and belt length must be positive.");
      return;
    }
    if (form.category === "belt" && !form.toothCount && !form.pitchLengthMm) {
      setError("Enter either a tooth count or pitch length for the belt.");
      return;
    }

    setSaving(true);
    try {
      const input: InventoryItemInput = {
        category: form.category,
        name: form.name.trim(),
        quantity,
        minimumQuantity,
        location: form.location.trim(),
        manufacturer: form.manufacturer.trim(),
        partNumber: form.partNumber.trim(),
        vendorUrl: form.vendorUrl.trim(),
        notes: form.notes.trim(),
        specs: buildSpecs(form),
      };
      if (item) {
        await updateInventoryItem(item.id, input, actor);
        onSaved(item.id);
      } else {
        onSaved(await createInventoryItem(input, actor));
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Inventory item could not be saved.");
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onClose={saving ? () => undefined : onClose}>
      <form onSubmit={save} className="max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded border border-steel-line bg-paper-raised shadow-2xl" aria-labelledby="inventory-dialog-title">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-steel-line bg-paper-raised px-5 py-4">
          <div>
            <p className="tracked-label text-[9px] font-bold text-blueprint">Inventory record</p>
            <h2 id="inventory-dialog-title" className="mt-0.5 text-lg font-semibold">{item ? "Edit hardware" : "Add hardware"}</h2>
          </div>
          <button type="button" className="rounded p-2 text-steel hover:bg-paper hover:text-ink" onClick={onClose} aria-label="Close dialog"><X size={19} /></button>
        </div>

        <div className="space-y-6 p-5 sm:p-6">
          <FieldSet legend="Hardware type">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(CATEGORY_META) as InventoryCategory[]).map((value) => (
                <button key={value} type="button" onClick={() => setField("category", value)} className={`flex items-center justify-center gap-2 rounded border px-3 py-3 text-xs font-semibold ${form.category === value ? "border-blueprint bg-blueprint text-white" : "border-steel-line bg-surface text-steel hover:text-ink"}`}>
                  {CATEGORY_META[value].icon} {CATEGORY_META[value].label}
                </button>
              ))}
            </div>
          </FieldSet>

          <FieldSet legend="Identity">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Display name" required className="sm:col-span-2">
                <input required maxLength={120} className="input" placeholder="e.g. 36T aluminum gear" value={form.name} onChange={(e) => setField("name", e.target.value)} autoFocus />
              </Field>
              <Field label="Manufacturer"><input className="input" maxLength={100} value={form.manufacturer} onChange={(e) => setField("manufacturer", e.target.value)} /></Field>
              <Field label="Part number"><input className="input font-mono" maxLength={100} value={form.partNumber} onChange={(e) => setField("partNumber", e.target.value)} /></Field>
            </div>
          </FieldSet>

          <FieldSet legend="Specifications">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {form.category === "gear" && <Field label="Diametral pitch"><input className="input" value="20 DP" readOnly aria-readonly="true" /></Field>}
              {(form.category === "pulley" || form.category === "belt") && (
                <Field label="Belt profile" required><DatalistInput required listId="belt-profile-options" options={existingProfiles} value={form.beltProfile} onChange={(value) => setField("beltProfile", value)} placeholder="3mm GT2 or 5mm HTD" /></Field>
              )}
              {(form.category === "pulley" || form.category === "belt") && (
                <Field label="Width (mm)" required><DatalistInput required listId="belt-width-options" options={existingWidths} value={form.widthMm} onChange={(value) => setField("widthMm", value)} placeholder="9 or 15" inputMode="decimal" /></Field>
              )}
              {form.category === "sprocket" && (
                <Field label="Chain size" required><DatalistInput required listId="chain-options" options={existingChains} value={form.chainSize} onChange={(value) => setField("chainSize", value)} placeholder="#25 or #35" /></Field>
              )}
              {form.category !== "belt" && (
                <Field label="Tooth count" required><input required className="input" type="number" min="1" step="1" value={form.toothCount} onChange={(e) => setField("toothCount", e.target.value)} /></Field>
              )}
              {form.category !== "belt" && (
                <Field label="Bore" required className={form.category === "gear" ? "sm:col-span-1" : ""}><DatalistInput required listId="bore-options" options={existingBores} value={form.bore} onChange={(value) => setField("bore", value)} placeholder="Choose or type a bore" /></Field>
              )}
              {form.category === "belt" && (
                <>
                  <Field label="Sides" required><select required className="input" value={form.sided} onChange={(e) => setField("sided", e.target.value)}><option value="single">Single sided</option><option value="double">Double sided</option></select></Field>
                  <Field label="Tooth count (one length required)"><input className="input" type="number" min="1" step="1" value={form.toothCount} onChange={(e) => setField("toothCount", e.target.value)} /></Field>
                  <Field label="Pitch length in mm (or teeth)"><input className="input" type="number" min="1" step="any" value={form.pitchLengthMm} onChange={(e) => setField("pitchLengthMm", e.target.value)} /></Field>
                </>
              )}
            </div>
            <p className="mt-3 text-[11px] text-steel">Suggested standards appear as options. You can type a new bore, profile, width, or chain size when new hardware arrives.</p>
          </FieldSet>

          <FieldSet legend="Stock & storage">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Quantity on hand" required><input required className="input" type="number" min="0" step="1" value={form.quantity} onChange={(e) => setField("quantity", e.target.value)} /></Field>
              <Field label="Restock at" required><input required className="input" type="number" min="0" step="1" value={form.minimumQuantity} onChange={(e) => setField("minimumQuantity", e.target.value)} /></Field>
              <Field label="Storage location"><input className="input" maxLength={100} placeholder="e.g. Bin M-14" value={form.location} onChange={(e) => setField("location", e.target.value)} /></Field>
              <Field label="Supplier URL" className="sm:col-span-2 lg:col-span-3"><input className="input" type="url" maxLength={500} placeholder="https://…" value={form.vendorUrl} onChange={(e) => setField("vendorUrl", e.target.value)} /></Field>
              <Field label="Notes" className="sm:col-span-2 lg:col-span-3"><textarea className="input min-h-24 resize-y" maxLength={1000} placeholder="Material, matching hardware, or purchasing notes…" value={form.notes} onChange={(e) => setField("notes", e.target.value)} /></Field>
            </div>
          </FieldSet>

          {error && <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        </div>
        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-steel-line bg-paper-raised px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn-primary inline-flex items-center justify-center gap-2" disabled={saving}>
            {saving ? <LoaderCircle className="animate-spin" size={15} /> : <PackagePlus size={15} />}
            {saving ? "Saving…" : item ? "Save changes" : "Add to inventory"}
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

function AdjustDialog({ item, actor, onClose }: { item: InventoryItem; actor: { uid: string; name: string }; onClose: () => void }) {
  const [delta, setDelta] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextQuantity = item.quantity + delta;

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!Number.isInteger(delta) || delta === 0 || nextQuantity < 0) {
      setError("Choose a non-zero whole-number adjustment that keeps stock at zero or above.");
      return;
    }
    setSaving(true);
    try {
      await adjustInventoryQuantity(item.id, delta, actor);
      onClose();
    } catch (adjustError) {
      setError(adjustError instanceof Error ? adjustError.message : "Stock could not be adjusted.");
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onClose={saving ? () => undefined : onClose}>
      <form onSubmit={save} className="w-full max-w-md rounded border border-steel-line bg-paper-raised p-5 shadow-2xl" aria-labelledby="adjust-stock-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="tracked-label text-[9px] font-bold text-blueprint">Stock count</p>
            <h2 id="adjust-stock-title" className="mt-1 text-lg font-semibold">Adjust {item.name}</h2>
          </div>
          <button type="button" className="rounded p-1.5 text-steel hover:bg-paper" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </div>
        <div className="my-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded border border-steel-line bg-surface p-4 text-center">
          <div><p className="text-3xl font-semibold tabular-nums">{item.quantity}</p><p className="tracked-label text-[8px] text-steel">current</p></div>
          <ChevronRight className="text-steel" size={20} />
          <div><p className={`text-3xl font-semibold tabular-nums ${nextQuantity < 0 ? "text-danger" : "text-blueprint"}`}>{nextQuantity}</p><p className="tracked-label text-[8px] text-steel">new count</p></div>
        </div>
        <Field label="Adjustment" required>
          <div className="flex items-stretch gap-2">
            <button type="button" className="btn-secondary px-3" onClick={() => setDelta((value) => value - 1)} aria-label="Remove one"><Minus size={15} /></button>
            <input required className="input text-center text-lg font-semibold tabular-nums" type="number" step="1" value={delta} onChange={(e) => setDelta(Number(e.target.value))} aria-describedby="adjustment-help" />
            <button type="button" className="btn-secondary px-3" onClick={() => setDelta((value) => value + 1)} aria-label="Add one"><Plus size={15} /></button>
          </div>
        </Field>
        <p id="adjustment-help" className="mt-2 text-[11px] text-steel">Use a positive number for received stock or a negative number for parts taken.</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[-5, -1, 1, 5].map((value) => <button key={value} type="button" className={`rounded border px-2 py-2 font-mono text-xs ${delta === value ? "border-blueprint bg-blueprint text-white" : "border-steel-line bg-surface"}`} onClick={() => setDelta(value)}>{value > 0 ? "+" : ""}{value}</button>)}
        </div>
        {error && <p className="mt-4 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn-primary inline-flex items-center justify-center gap-2" disabled={saving || delta === 0 || nextQuantity < 0}>
            {saving && <LoaderCircle className="animate-spin" size={15} />} Update count
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

interface ItemForm {
  category: InventoryCategory;
  name: string;
  quantity: string;
  minimumQuantity: string;
  location: string;
  manufacturer: string;
  partNumber: string;
  vendorUrl: string;
  notes: string;
  beltProfile: string;
  widthMm: string;
  sided: string;
  toothCount: string;
  bore: string;
  chainSize: string;
  pitchLengthMm: string;
}

function formFromItem(item: InventoryItem | null): ItemForm {
  return {
    category: item?.category ?? "gear",
    name: item?.name ?? "",
    quantity: String(item?.quantity ?? 0),
    minimumQuantity: String(item?.minimumQuantity ?? 2),
    location: item?.location ?? "",
    manufacturer: item?.manufacturer ?? "",
    partNumber: item?.partNumber ?? "",
    vendorUrl: item?.vendorUrl ?? "",
    notes: item?.notes ?? "",
    beltProfile: item?.specs.beltProfile ?? "",
    widthMm: item?.specs.widthMm ?? "",
    sided: item?.specs.sided ?? "single",
    toothCount: item?.specs.toothCount ? String(item.specs.toothCount) : "",
    bore: item?.specs.bore ?? "",
    chainSize: item?.specs.chainSize ?? "",
    pitchLengthMm: item?.specs.pitchLengthMm ? String(item.specs.pitchLengthMm) : "",
  };
}

function buildSpecs(form: ItemForm): InventorySpecs {
  const toothCount = form.toothCount ? Number(form.toothCount) : undefined;
  if (form.category === "gear") return { diametralPitch: "20 DP", toothCount, bore: form.bore.trim() };
  if (form.category === "pulley") return { beltProfile: form.beltProfile.trim(), widthMm: form.widthMm.trim(), toothCount, bore: form.bore.trim() };
  if (form.category === "sprocket") return { chainSize: form.chainSize.trim(), toothCount, bore: form.bore.trim() };
  return {
    beltProfile: form.beltProfile.trim(),
    widthMm: form.widthMm.trim(),
    sided: form.sided,
    toothCount,
    pitchLengthMm: form.pitchLengthMm ? Number(form.pitchLengthMm) : undefined,
  };
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label><span className="sr-only">{label}</span><select className="input h-10 text-xs" value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

function DatalistInput({ listId, options, value, onChange, ...props }: { listId: string; options: string[]; value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "list">) {
  return <><input {...props} className="input" list={listId} value={value} onChange={(event) => onChange(event.target.value)} /><datalist id={listId}>{options.map((option) => <option key={option} value={option} />)}</datalist></>;
}

function FieldSet({ legend, children }: { legend: string; children: ReactNode }) {
  return <fieldset><legend className="tracked-label mb-3 text-[9px] font-bold text-steel">{legend}</legend>{children}</fieldset>;
}

function Field({ label, children, required = false, className = "" }: { label: string; children: ReactNode; required?: boolean; className?: string }) {
  return <label className={className}><span className="mb-1.5 block text-xs font-medium text-steel">{label}{required && <span className="ml-1 text-danger">*</span>}</span>{children}</label>;
}

function DetailGroup({ title, children }: { title: string; children: ReactNode }) {
  return <div><p className="tracked-label mb-2 text-[9px] font-bold text-steel">{title}</p><dl className="space-y-2 rounded border border-steel-line bg-surface p-3">{children}</dl></div>;
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-start justify-between gap-4 text-xs"><dt className="shrink-0 text-steel">{label}</dt><dd className={`${mono ? "font-mono text-[10px]" : "font-medium"} text-right text-ink`}>{value}</dd></div>;
}

function CategoryBadge({ category }: { category: InventoryCategory }) {
  const meta = CATEGORY_META[category];
  return <span className="tracked-label inline-flex items-center gap-1.5 rounded-sm bg-blueprint/10 px-2 py-1 text-[8px] font-bold text-blueprint">{meta.icon}{meta.label.slice(0, -1)}</span>;
}

function Stat({ label, value, attention = false }: { label: string; value: number; attention?: boolean }) {
  return <div className="min-w-24 border-r border-steel-line px-3 py-2 text-center last:border-r-0"><p className={`text-lg font-semibold tabular-nums ${attention ? "text-hazard" : "text-ink"}`}>{value}</p><p className="tracked-label text-[8px] text-steel">{label}</p></div>;
}

function specRows(item: InventoryItem): Array<[string, string]> {
  const specs = item.specs;
  if (item.category === "gear") return [["Diametral pitch", specs.diametralPitch ?? "20 DP"], ["Teeth", formatTeeth(specs.toothCount)], ["Bore", specs.bore || "Not recorded"]];
  if (item.category === "pulley") return [["Belt profile", specs.beltProfile || "Not recorded"], ["Width", formatWidth(specs.widthMm)], ["Teeth", formatTeeth(specs.toothCount)], ["Bore", specs.bore || "Not recorded"]];
  if (item.category === "sprocket") return [["Chain size", specs.chainSize || "Not recorded"], ["Teeth", formatTeeth(specs.toothCount)], ["Bore", specs.bore || "Not recorded"]];
  return [["Belt profile", specs.beltProfile || "Not recorded"], ["Width", formatWidth(specs.widthMm)], ["Sides", specs.sided ? `${titleCase(specs.sided)} sided` : "Not recorded"], ["Teeth", formatTeeth(specs.toothCount)], ["Pitch length", specs.pitchLengthMm ? `${specs.pitchLengthMm} mm` : "Not recorded"]];
}

function formatSpecs(item: InventoryItem) {
  return specRows(item).map(([, value]) => value).filter((value) => value !== "Not recorded").join(" · ");
}

function searchableValues(item: InventoryItem) {
  return [item.name, item.category, item.location, item.manufacturer, item.partNumber, item.notes, ...Object.values(item.specs).map(String)];
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function positiveWholeNumber(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0;
}

function formatTeeth(value?: number) { return value ? `${value} teeth` : "Not recorded"; }
function formatWidth(value?: string) { return value ? `${value} mm` : "Not recorded"; }
function titleCase(value: string) { return value.replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: Date | null) { return value?.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) ?? "recently"; }
