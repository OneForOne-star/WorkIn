<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/** Escribe en audit_logs (tabla inmutable: solo se agrega). */
final class Audit
{
    public static function record(
        string $type,
        int $id,
        string $action,
        ?int $companyId = null,
        ?string $field = null,
        mixed $old = null,
        mixed $new = null,
        ?string $reason = null,
    ): void {
        $request = app()->runningInConsole() ? null : request();

        DB::table('audit_logs')->insert([
            'company_id' => $companyId,
            'user_id' => $request?->user()?->id,
            'auditable_type' => $type,
            'auditable_id' => $id,
            'action' => $action,
            'field_name' => $field,
            'old_value' => self::str($old),
            'new_value' => self::str($new),
            'reason' => $reason,
            'ip_address' => $request?->ip(),
            'created_at' => now(),
        ]);
    }

    private static function str(mixed $v): ?string
    {
        if ($v === null) {
            return null;
        }
        if ($v instanceof \DateTimeInterface) {
            return $v->format('Y-m-d');
        }

        return is_scalar($v) ? (string) $v : json_encode($v, JSON_UNESCAPED_UNICODE);
    }
}
