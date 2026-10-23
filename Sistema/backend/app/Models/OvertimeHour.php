<?php

namespace App\Models;

use App\Support\Time;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class OvertimeHour extends Model
{
    use SoftDeletes;

    protected $table = 'overtime_hours';

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return [
            'company_id' => 'integer',
            'attendance_id' => 'integer',
            'hours' => 'float',
            'authorized_by' => 'integer',
            'authorized_at' => 'datetime',
        ];
    }

    public function toApi(): array
    {
        return [
            'id' => (int) $this->id,
            'attendance_id' => (int) $this->attendance_id,
            'hours' => $this->hours,
            'comments' => $this->comments,
            'authorized_at' => Time::iso($this->authorized_at),
        ];
    }
}
