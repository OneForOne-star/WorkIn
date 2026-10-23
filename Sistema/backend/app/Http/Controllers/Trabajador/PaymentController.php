<?php

namespace App\Http\Controllers\Trabajador;

use App\Http\Controllers\Controller;
use App\Support\Audit;
use App\Support\Periods;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Resúmenes de pago del trabajador: revisar, aceptar o reclamar. */
class PaymentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $rows = $this->base($request->user()->id)->orderByDesc('p.start_date')->limit(100)->get();

        return response()->json(['data' => $rows->map(fn ($r) => Periods::statementApi($r) + ['company_name' => $r->company_name])->values()]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $r = $this->base($request->user()->id)->where('s.id', $id)->first();
        abort_if(! $r, 404);

        return response()->json(Periods::statementApi($r) + [
            'company_name' => $r->company_name,
            'lines' => Periods::lines((int) $r->payment_period_id, (int) $r->user_id),
        ]);
    }

    public function accept(Request $request, int $id): JsonResponse
    {
        $st = $this->mine($request->user()->id, $id);
        if (! in_array($st->status, ['sent', 'disputed'], true)) {
            return response()->json(['message' => 'Este resumen ya no se puede aceptar.', 'code' => 'BAD_STATUS'], 409);
        }
        DB::table('payment_statements')->where('id', $st->id)->update(['status' => 'accepted', 'responded_at' => now(), 'updated_at' => now()]);
        Audit::record('payment_statement', $st->id, 'updated', (int) $st->company_id, 'status', $st->status, 'accepted');

        return response()->json(['ok' => true]);
    }

    public function dispute(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['comment' => ['required', 'string', 'min:5', 'max:500']]);
        $st = $this->mine($request->user()->id, $id);
        if ($st->status !== 'sent') {
            return response()->json(['message' => 'Este resumen no se puede reclamar ahora.', 'code' => 'BAD_STATUS'], 409);
        }
        DB::table('payment_statements')->where('id', $st->id)->update([
            'status' => 'disputed', 'dispute_comment' => trim($data['comment']), 'responded_at' => now(), 'updated_at' => now(),
        ]);
        Audit::record('payment_statement', $st->id, 'updated', (int) $st->company_id, 'status', 'sent', 'disputed', trim($data['comment']));

        return response()->json(['ok' => true]);
    }

    private function base(int $userId)
    {
        return DB::table('payment_statements as s')
            ->join('payment_periods as p', 'p.id', '=', 's.payment_period_id')
            ->join('companies as c', 'c.id', '=', 's.company_id')
            ->where('s.user_id', $userId)->whereIn('s.status', ['sent', 'accepted', 'disputed'])
            ->select('s.*', 'p.start_date', 'p.end_date', 'c.name as company_name');
    }

    private function mine(int $userId, int $id): object
    {
        $st = DB::table('payment_statements')->where('id', $id)->where('user_id', $userId)->first();
        abort_if(! $st, 404);

        return $st;
    }
}
