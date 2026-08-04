const features = [
  {
    title: 'Key-term extraction',
    body: 'GPT-4o pulls the 10–17 terms that matter for NDAs and MSAs, with a confidence score on every field.',
  },
  {
    title: 'Source-cited, always',
    body: 'Every extracted term links back to its page and verbatim sentence — nothing is asserted without a citation.',
  },
  {
    title: 'Grounded contract chat',
    body: 'Ask follow-up questions and get answers strictly from the uploaded document, with page references.',
  },
]

export default function MarketingHome() {
  return (
    <main className="flex min-h-screen flex-col bg-white px-6 py-24 md:px-28">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10">
        <section className="flex flex-col gap-6">
          <span className="w-fit rounded-sm border border-blue-200 bg-blue-50 px-2 py-0.5 text-[12px] font-normal leading-[18px] text-blue-700">
            NDA &amp; MSA review, in minutes
          </span>
          <h1 className="max-w-2xl text-[48px] font-bold leading-[56px] text-grey-900">
            Know what you&apos;re signing, without a lawyer on retainer
          </h1>
          <p className="max-w-xl text-[16px] font-medium leading-[24px] text-grey-500">
            ContractIQ extracts the key terms in your NDA or MSA, cites the exact page and
            sentence for each one, and answers your follow-up questions grounded strictly in
            the document.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="/sign-up"
              className="rounded-md bg-blue-500 px-6 py-3 text-[16px] font-medium leading-[24px] text-white transition-colors duration-100 hover:bg-blue-600"
            >
              Get started
            </a>
            <a
              href="/sign-in"
              className="rounded-md border border-grey-100 px-6 py-3 text-[16px] font-medium leading-[24px] text-grey-900 transition-colors duration-100 hover:border-grey-200 hover:bg-grey-50"
            >
              Sign in
            </a>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="text-[24px] font-medium leading-[32px] text-grey-900">
            How it works
          </h2>
          <div className="flex flex-wrap gap-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="flex min-w-[240px] flex-1 flex-col gap-2 rounded-lg border border-grey-100 bg-grey-25 p-6"
              >
                <h3 className="text-[16px] font-medium leading-[24px] text-grey-900">
                  {feature.title}
                </h3>
                <p className="text-[12px] font-normal leading-[18px] text-grey-500">
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <p className="mx-auto mt-16 w-full max-w-5xl text-[12px] font-normal leading-[18px] text-grey-400">
        ContractIQ is not a substitute for legal advice. Always consult a qualified attorney
        for contract decisions.
      </p>
    </main>
  )
}
