"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CompanyProfile,
  INDUSTRY_OPTIONS,
  emptyProfile,
} from "@/lib/companyProfile";

type Step = 1 | 2 | 3 | 4;

interface LogoInfo {
  exists: boolean;
  ext?: string;
  size?: number;
  updated_at?: string;
}

export default function SetupPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<CompanyProfile>(emptyProfile());
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [logo, setLogo] = useState<LogoInfo>({ exists: false });
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing profile + logo (allow re-run of setup to edit)
  useEffect(() => {
    Promise.all([
      fetch("/api/setup")
        .then((r) => r.json())
        .then((d: { complete: boolean; profile: CompanyProfile }) => {
          if (d.profile) setProfile({ ...emptyProfile(), ...d.profile });
        }),
      fetch("/api/brand/logo?info=1")
        .then((r) => (r.ok ? r.json() : { exists: false }))
        .then((info: LogoInfo) => setLogo(info))
        .catch(() => setLogo({ exists: false })),
    ]).finally(() => setLoaded(true));
  }, []);

  async function onLogoSelected(file: File) {
    setLogoError(null);
    setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/brand/logo", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "อัปโหลดล้มเหลว");
      setLogo({ exists: true, ext: data.ext, size: data.size, updated_at: data.updated_at });
    } catch (e) {
      setLogoError((e as Error).message);
    } finally {
      setLogoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeLogo() {
    setLogoError(null);
    setLogoBusy(true);
    try {
      const res = await fetch("/api/brand/logo", { method: "DELETE" });
      if (!res.ok) throw new Error("ลบโลโก้ไม่สำเร็จ");
      setLogo({ exists: false });
    } catch (e) {
      setLogoError((e as Error).message);
    } finally {
      setLogoBusy(false);
    }
  }

  function update<K extends keyof CompanyProfile>(k: K, v: CompanyProfile[K]) {
    setProfile((p) => ({ ...p, [k]: v }));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup failed");
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  function next() {
    if (step === 1 && !profile.name.trim()) {
      setError("ต้องใส่ชื่อบริษัทก่อนไปต่อ");
      return;
    }
    setError(null);
    setStep((s) => Math.min(4, s + 1) as Step);
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(1, s - 1) as Step);
  }

  if (!loaded) {
    return (
      <main className="flex h-screen items-center justify-center text-ink-dim">
        กำลังโหลด…
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 text-center">
          {logo.exists ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/brand/logo?t=${logo.updated_at ?? ""}`}
              alt="logo"
              className="mx-auto mb-3 h-12 w-12 rounded-xl border border-border object-cover"
            />
          ) : (
            <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-gradient-to-br from-accent to-accent-soft" />
          )}
          <h1 className="text-2xl font-semibold text-ink">
            ตั้งค่าบริษัทเสมือนของคุณ
          </h1>
          <p className="mt-1 text-sm text-ink-dim">
            ใส่ข้อมูลจริงให้พนักงาน AI ของคุณรู้จักบริษัท
          </p>
        </header>

        <Stepper step={step} />

        <div className="card p-6">
          {step === 1 && (
            <Section title="1. ข้อมูลบริษัท" subtitle="ชื่อ และประเภทธุรกิจที่คุณทำอยู่">
              <Field label="โลโก้บริษัท (ไม่บังคับ)">
                <div className="flex items-center gap-4 rounded-lg border border-border bg-surface-2/40 p-3">
                  <LogoPreview logo={logo} />
                  <div className="flex-1 space-y-1.5">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onLogoSelected(f);
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={logoBusy}
                        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-accent disabled:opacity-50"
                      >
                        {logoBusy
                          ? "กำลังอัปโหลด…"
                          : logo.exists
                            ? "เปลี่ยนโลโก้"
                            : "เลือกไฟล์โลโก้"}
                      </button>
                      {logo.exists && !logoBusy && (
                        <button
                          type="button"
                          onClick={removeLogo}
                          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/20"
                        >
                          ลบโลโก้
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-ink-dim">
                      PNG / JPG / WEBP / SVG ขนาดไม่เกิน 5 MB — แนะนำสี่เหลี่ยมจัตุรัส 256×256 ขึ้นไป
                    </p>
                    {logoError && (
                      <p className="text-[11px] text-danger">{logoError}</p>
                    )}
                  </div>
                </div>
              </Field>
              <Field label="ชื่อบริษัท *">
                <input
                  className="input"
                  value={profile.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="เช่น Acme Co., Ltd."
                />
              </Field>
              <Field label="ชื่อจดทะเบียน (ไม่บังคับ)">
                <input
                  className="input"
                  value={profile.legal_name || ""}
                  onChange={(e) => update("legal_name", e.target.value)}
                  placeholder="บริษัท เอคเม จำกัด"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="อุตสาหกรรม">
                  <select
                    className="input"
                    value={profile.industry}
                    onChange={(e) => update("industry", e.target.value)}
                  >
                    {INDUSTRY_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="ปีที่ก่อตั้ง">
                  <input
                    type="number"
                    className="input"
                    value={profile.founded_year}
                    onChange={(e) =>
                      update("founded_year", Number(e.target.value) || 2026)
                    }
                  />
                </Field>
              </div>
              <Field label="ประเภทธุรกิจที่ทำจริง">
                <input
                  className="input"
                  value={profile.business_type}
                  onChange={(e) => update("business_type", e.target.value)}
                  placeholder="เช่น ขายซอฟต์แวร์ CRM ให้ SME, รับทำ video production"
                />
              </Field>
              <Field label="คำอธิบายสั้นๆ (2-3 ประโยค)">
                <textarea
                  className="input min-h-[80px]"
                  value={profile.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="เราช่วยให้ SME ไทยจัดการลูกค้าได้ดีขึ้นด้วย CRM ที่ใช้ง่าย…"
                />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="พนักงานปัจจุบัน">
                  <input
                    type="number"
                    className="input"
                    value={profile.team_size}
                    onChange={(e) =>
                      update("team_size", Number(e.target.value) || 1)
                    }
                  />
                </Field>
                <Field label="ประเทศ">
                  <input
                    className="input"
                    value={profile.country}
                    onChange={(e) => update("country", e.target.value)}
                  />
                </Field>
                <Field label="สกุลเงิน">
                  <input
                    className="input"
                    value={profile.currency}
                    onChange={(e) => update("currency", e.target.value)}
                  />
                </Field>
              </div>
            </Section>
          )}

          {step === 2 && (
            <Section
              title="2. งบประมาณและการเงิน"
              subtitle="ตัวเลขสำคัญที่ Finance Analyst และ CEO จะใช้ตัดสินใจ"
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="ปีงบประมาณ">
                  <input
                    type="number"
                    className="input"
                    value={profile.fiscal_year}
                    onChange={(e) =>
                      update("fiscal_year", Number(e.target.value) || 2026)
                    }
                  />
                </Field>
                <Field label="Gross Margin เป้า (%)">
                  <input
                    type="number"
                    className="input"
                    value={profile.gross_margin_target_pct}
                    onChange={(e) =>
                      update(
                        "gross_margin_target_pct",
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </Field>
              </div>
              <Field label={`เป้ารายได้ต่อเดือน (${profile.currency})`}>
                <input
                  type="number"
                  className="input"
                  value={profile.monthly_revenue_target}
                  onChange={(e) =>
                    update(
                      "monthly_revenue_target",
                      Number(e.target.value) || 0,
                    )
                  }
                />
              </Field>
              <Field label={`เป้ารายได้ต่อปี (${profile.currency})`}>
                <input
                  type="number"
                  className="input"
                  value={profile.annual_revenue_target}
                  onChange={(e) =>
                    update("annual_revenue_target", Number(e.target.value) || 0)
                  }
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`เงินสดปัจจุบัน (${profile.currency})`}>
                  <input
                    type="number"
                    className="input"
                    value={profile.current_cash}
                    onChange={(e) =>
                      update("current_cash", Number(e.target.value) || 0)
                    }
                  />
                </Field>
                <Field label={`ค่าใช้จ่ายต่อเดือน (${profile.currency})`}>
                  <input
                    type="number"
                    className="input"
                    value={profile.monthly_opex_estimate}
                    onChange={(e) =>
                      update(
                        "monthly_opex_estimate",
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </Field>
              </div>
              <Hint>
                Cash Runway โดยประมาณ:{" "}
                <strong className="text-ink">
                  {profile.monthly_opex_estimate > 0
                    ? (
                        profile.current_cash / profile.monthly_opex_estimate
                      ).toFixed(1)
                    : "—"}{" "}
                  เดือน
                </strong>{" "}
                (cash ÷ burn) — Finance Analyst จะเตือนถ้า {"<"} 3 เดือน
              </Hint>
            </Section>
          )}

          {step === 3 && (
            <Section
              title="3. เป้าหมายและ OKR"
              subtitle="กำหนด North Star Metric และ Quarterly OKR ให้ทีม"
            >
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="North Star Metric">
                    <input
                      className="input"
                      value={profile.nsm_name}
                      onChange={(e) => update("nsm_name", e.target.value)}
                      placeholder="เช่น Active Paying Teams"
                    />
                  </Field>
                </div>
                <Field label="หน่วย">
                  <input
                    className="input"
                    value={profile.nsm_unit}
                    onChange={(e) => update("nsm_unit", e.target.value)}
                    placeholder="teams"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="ค่าปัจจุบัน">
                  <input
                    type="number"
                    className="input"
                    value={profile.nsm_current}
                    onChange={(e) =>
                      update("nsm_current", Number(e.target.value) || 0)
                    }
                  />
                </Field>
                <Field label="เป้าหมายสิ้นปี">
                  <input
                    type="number"
                    className="input"
                    value={profile.nsm_target}
                    onChange={(e) =>
                      update("nsm_target", Number(e.target.value) || 0)
                    }
                  />
                </Field>
              </div>
              <Field label="Quarterly Objective (Q ปัจจุบัน)">
                <input
                  className="input"
                  value={profile.quarterly_objective}
                  onChange={(e) =>
                    update("quarterly_objective", e.target.value)
                  }
                  placeholder="เช่น Reach 60 paying teams with stable retention"
                />
              </Field>
              <Field label="Key Results (สูงสุด 3 ข้อ)">
                {profile.key_results.map((kr, i) => (
                  <input
                    key={i}
                    className="input mb-2"
                    value={kr}
                    onChange={(e) => {
                      const arr = [...profile.key_results];
                      arr[i] = e.target.value;
                      update("key_results", arr);
                    }}
                    placeholder={`KR ${i + 1} — วัดได้ มี deadline`}
                  />
                ))}
              </Field>
            </Section>
          )}

          {step === 4 && (
            <Section
              title="4. ข้อมูลตั้งต้น"
              subtitle="เลือกว่าจะเริ่มจากข้อมูลตัวอย่าง หรือเริ่มจากศูนย์"
            >
              <div className="space-y-3">
                <ChoiceCard
                  active={profile.data_mode === "sample"}
                  onClick={() => update("data_mode", "sample")}
                  title="เริ่มจากข้อมูลตัวอย่าง (แนะนำสำหรับทดลอง)"
                  desc="คงข้อมูลจำลอง (pipeline 10 ดีล, finance 6 เดือน, ticket 8 ใบ, พนักงาน 10 คน) ไว้ — ใช้ลองคุย/รันรายงานได้ทันที"
                />
                <ChoiceCard
                  active={profile.data_mode === "blank"}
                  onClick={() => update("data_mode", "blank")}
                  title="เริ่มจากศูนย์"
                  desc="ล้าง CSV ทั้งหมดให้เหลือแค่หัวตาราง รีเซ็ต KPI ให้ใช้ค่าจากที่คุณกรอก — เหมาะเมื่อจะใส่ข้อมูลจริงของบริษัทเอง"
                />
              </div>
              <Hint>
                ไฟล์ที่แก้ได้ทีหลัง: <code className="text-accent">data/*.csv</code>{" "}
                และ <code className="text-accent">data/kpi.json</code>{" "}
                — แก้ไฟล์ตรงๆ ในเครื่อง ระบบอ่านสดทุก request
              </Hint>
            </Section>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
            <button
              onClick={back}
              disabled={step === 1 || submitting}
              className="rounded-lg px-4 py-2 text-sm text-ink-dim hover:text-ink disabled:opacity-30"
            >
              ← ย้อนกลับ
            </button>
            {step < 4 ? (
              <button onClick={next} className="btn-primary">
                ถัดไป →
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={submitting}
                className="btn-primary"
              >
                {submitting ? "กำลังบันทึก…" : "เริ่มใช้งานบริษัท ✓"}
              </button>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-ink-dim/70">
          ข้อมูลจะถูกบันทึกที่ <code className="text-accent">data/company-profile.json</code>{" "}
          และ <code className="text-accent">data/company-goals.json</code>
        </p>
      </div>
    </main>
  );
}

function Stepper({ step }: { step: Step }) {
  const labels = ["บริษัท", "การเงิน", "เป้าหมาย", "ข้อมูล"];
  return (
    <ol className="mb-6 flex items-center justify-between gap-1">
      {labels.map((l, i) => {
        const n = (i + 1) as Step;
        const done = n < step;
        const active = n === step;
        return (
          <li key={l} className="flex flex-1 items-center gap-2">
            <span
              className={[
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition",
                active && "bg-accent-soft text-white",
                done && "bg-ok/20 text-ok",
                !active && !done && "bg-surface-2 text-ink-dim",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {done ? "✓" : n}
            </span>
            <span
              className={[
                "text-xs font-medium",
                active ? "text-ink" : "text-ink-dim",
              ].join(" ")}
            >
              {l}
            </span>
            {i < labels.length - 1 && (
              <span className="ml-1 h-px flex-1 bg-border" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="text-xs text-ink-dim">{subtitle}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-dim">
        {label}
      </span>
      {children}
    </label>
  );
}

function LogoPreview({ logo }: { logo: LogoInfo }) {
  if (logo.exists) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/brand/logo?t=${logo.updated_at ?? ""}`}
        alt="logo preview"
        className="h-16 w-16 shrink-0 rounded-lg border border-border bg-surface object-cover"
      />
    );
  }
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface/50 text-[10px] uppercase text-ink-dim">
      ไม่มี
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-xs text-ink-dim">
      {children}
    </p>
  );
}

function ChoiceCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-xl border p-4 text-left transition",
        active
          ? "border-accent bg-accent-soft/10 ring-1 ring-accent"
          : "border-border bg-surface-2/40 hover:border-ink-dim/40",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span
          className={[
            "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2",
            active ? "border-accent bg-accent" : "border-ink-dim",
          ].join(" ")}
        />
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-dim">{desc}</p>
        </div>
      </div>
    </button>
  );
}
