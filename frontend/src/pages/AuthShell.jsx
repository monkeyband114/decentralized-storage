/** Shared two-column frame for the sign-in and registration pages. */
const PIPELINE = [
  ["SHA-256", "Every file is fingerprinted before it is stored."],
  ["AES-256-GCM", "Content is encrypted before it leaves the server."],
  ["IPFS", "Encrypted files are held in content-addressed storage."],
  ["Ethereum", "Hashes and permissions are recorded on-chain."]
];

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen">
      {/* Left: brand and pipeline summary */}
      <div className="hidden w-1/2 flex-col justify-between border-r border-slate-800 bg-slate-900/40 p-12 lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-lg text-cyan-300">
            ⛨
          </div>
          <div>
            <p className="text-base font-semibold text-slate-100">SecureChain Storage</p>
            <p className="text-[11px] uppercase tracking-widest text-slate-500">
              Decentralized · Verified
            </p>
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-2xl font-semibold leading-snug text-slate-100">
            Storage you can prove
            <br />
            has not been altered.
          </h2>
          <p className="mb-8 max-w-md text-sm leading-relaxed text-slate-400">
            Files are hashed, encrypted and distributed across IPFS, while their fingerprints and
            access rules are written to an Ethereum smart contract. Any change to stored content is
            detected the moment the file is retrieved.
          </p>

          <ol className="flex flex-col gap-3">
            {PIPELINE.map(([name, description], index) => (
              <li key={name} className="flex gap-3">
                <span className="mono mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-[11px] text-cyan-300">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-200">{name}</p>
                  <p className="text-xs text-slate-500">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <p className="text-[11px] text-slate-600">
          Data integrity · Access control · Auditable history
        </p>
      </div>

      {/* Right: the form */}
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
              ⛨
            </div>
            <p className="text-sm font-semibold text-slate-100">SecureChain Storage</p>
          </div>

          <h1 className="text-xl font-semibold text-slate-50">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-slate-400">{subtitle}</p>

          {children}

          {footer && <p className="mt-6 text-center text-sm text-slate-400">{footer}</p>}
        </div>
      </div>
    </div>
  );
}
