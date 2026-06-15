export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    service: "tax-refund-intake",
    now: new Date().toISOString(),
  });
}
