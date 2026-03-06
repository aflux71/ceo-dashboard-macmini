import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryOp(fn, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            if (e.status === 429 && i < retries - 1) {
                const wait = (i + 1) * 3000;
                console.log(`Rate limited, waiting ${wait/1000}s...`);
                await sleep(wait);
            } else {
                throw e;
            }
        }
    }
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { file_url, channel, skip_rows, max_rows } = await req.json();
    if (!file_url || !channel) {
        return Response.json({ error: 'file_url and channel (online|pos) required' }, { status: 400 });
    }

    const skipRows = skip_rows || 0;
    const maxRows = max_rows || 999999;

    // Fetch CSV
    const csvResp = await fetch(file_url);
    const csvText = await csvResp.text();
    const lines = csvText.split('\n');
    console.log('Total CSV lines:', lines.length, '| Skip rows:', skipRows, '| Max rows:', maxRows);

    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        result.push(current.trim());
        return result;
    }

    // Parse rows - no dedup, just skip first N and take max M
    const records = [];
    let rowIndex = 0;
    let emptySkuSkipped = 0;
    let negativeSkipped = 0;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Skip empty SKU rows and negative qty without counting toward rowIndex
        const fields = parseCSVLine(line);
        let sku, productName, day, qty, locationName;
        if (channel === 'pos') {
            locationName = fields[0] || '';
            productName = fields[1] || '';
            sku = fields[2] || '';
            day = fields[3] || '';
            qty = parseInt(fields[4]) || 0;
        } else {
            productName = fields[0] || '';
            sku = fields[1] || '';
            day = fields[2] || '';
            qty = parseInt(fields[3]) || 0;
            locationName = '';
        }

        if (!sku) { emptySkuSkipped++; continue; }
        if (qty <= 0) { negativeSkipped++; continue; }

        rowIndex++;
        if (rowIndex <= skipRows) continue;
        if (records.length >= maxRows) break;

        records.push({
            order_id: `CSV-${channel}-${sku}-${day}-${(locationName || 'online').replace(/\s+/g, '_')}`,
            sku,
            product_name: productName,
            quantity: qty,
            order_date: `${day}T12:00:00Z`,
            channel: channel === 'pos' ? 'pos' : 'online',
            location_name: locationName || (channel === 'online' ? 'Online' : ''),
            location_id: ''
        });
    }

    console.log(`Will create ${records.length} records (skipped first ${skipRows} valid rows, ${emptySkuSkipped} empty SKUs, ${negativeSkipped} negative qty)`);

    // Bulk insert in batches of 200
    let created = 0;
    for (let i = 0; i < records.length; i += 200) {
        const batch = records.slice(i, i + 200);
        await retryOp(() => base44.asServiceRole.entities.ShopifySaleRecord.bulkCreate(batch));
        created += batch.length;
        if (created % 2000 === 0) console.log(`Created ${created}/${records.length}`);
        await sleep(200);
    }
    console.log(`Done! Created ${created} records`);

    return Response.json({
        success: true,
        channel,
        records_created: created,
        skip_rows_used: skipRows,
        next_skip_rows: skipRows + created,
        empty_sku_skipped: emptySkuSkipped,
        negative_skipped: negativeSkipped
    });
});