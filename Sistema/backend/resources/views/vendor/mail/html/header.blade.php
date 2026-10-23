@props(['url'])
<tr>
<td class="header">
<a href="{{ config('workin.frontend_url') }}" style="display: inline-block; font-size: 26px; font-weight: bold; letter-spacing: -0.5px; color: #b8481a; text-decoration: none;">
{{ $slot }}
</a>
</td>
</tr>
