<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Support\Audit;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SuspendExpiredCompanies extends Command
{
    protected $signature = 'workin:suspend-expired';
    protected $description = 'Suspende las empresas con la suscripción vencida más allá de los días de gracia';

    public function handle(): int
    {
        $grace = (int) config('workin.grace_days');
        $cutoff = now()->subDays($grace)->toDateString();

        $companies = Company::where('status', 'active')
            ->whereNotNull('subscription_ends_at')
            ->where('subscription_ends_at', '<', $cutoff)
            ->get();

        foreach ($companies as $company) {
            DB::transaction(function () use ($company, $grace) {
                $company->status = 'suspended';
                $company->save();
                $company->revokeTokens();
                Audit::record('company', $company->id, 'updated', $company->id, 'status', 'active', 'suspended',
                    "Suscripción vencida hace más de {$grace} días");
            });
            $this->line("Suspendida: {$company->name}");
        }

        $this->info('Empresas suspendidas: '.$companies->count());

        return self::SUCCESS;
    }
}
