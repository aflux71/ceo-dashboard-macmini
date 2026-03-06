import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryOp(fn, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            if (e.status === 429 && i < retries - 1) {
                console.log(`Rate limited, waiting ${(i + 1) * 2}s...`);
                await sleep((i + 1) * 2000);
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

    const { file_url, channel } = await req.json();
    if (!file_url || !channel) {
        return Response.json({ error: 'file_url and channel (online|pos) required' }, { status: 400 });
    }

    // Fetch CSV
    const csvResp = await fetch(file_url);
    const csvText = await csvResp.text();
    const lines = csvText.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    console.log('Headers:', headers);
    console.log('Total lines:', lines.length);

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

    // Load existing dedup keys with rate limit handling
    console.log('Loading existing records for dedup...');
    const existingKeys = new Set();
    let skip = 0;
    const batchSize = 500;
    while (true) {
        const batch = await retryOp(() => 
            base44.asServiceRole.entities.ShopifySaleRecord.list('-created_date', batchSize, skip)
        );
        if (!batch || batch.length === 0) break;
        for (const rec of batch) {
            if (rec.order_date && rec.order_date.startsWith('2025')) {
                const day = rec.order_date.substring(0, 10);
                const key = `${rec.sku}|${day}|${rec.channel}|${rec.location_name || ''}`;
                existingKeys.add(key);
            }
        }
        skip += batchSize;
        if (batch.length < batchSize) break;
        // Small delay between dedup pages to avoid rate limits
        if (skip % 2000 === 0) await sleep(500);
    }
    console.log(`Loaded ${existingKeys.size} existing 2025 dedup keys from ${skip} total records`);

    // Parse rows
    const records = [];
    let skipped = 0;
    let emptySkuSkipped = 0;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
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
        if (qty <= 0) { skipped++; continue; }

        const dedupKey = `${sku}|${day}|${channel}|${locationName}`;
        if (existingKeys.has(dedupKey)) { skipped++; continue; }

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
        existingKeys.add(dedupKey);
    }

    console.log(`Parsed ${records.length} new records, skipped ${skipped} dupes, ${emptySkuSkipped} empty SKUs`);

    // Bulk insert in batches of 200 with rate limit handling
    let created = 0;
    for (let i = 0; i < records.length; i += 200) {
        const batch = records.slice(i, i + 200);
        await retryOp(() => base44.asServiceRole.entities.ShopifySaleRecord.bulkCreate(batch));
        created += batch.length;
        if (created % 1000 === 0) console.log(`Created ${created}/${records.length}`);
        // Small delay to avoid rate limits
        await sleep(300);
    }
    console.log(`Done! Created ${created} records total`);

    await retryOp(() => base44.asServiceRole.entities.SyncLog.create({
        sync_type: 'shopify_orders',
        status: 'success',
        records_processed: records.length + skipped + emptySkuSkipped,
        records_created: created,
        triggered_by: user.email,
        notes: `CSV import: ${channel}, ${created} created, ${skipped} dupes, ${emptySkuSkipped} empty SKUs`,
        date_range_start: '2025-01-01',
        date_range_end: '2025-12-31'
    }));

    return Response.json({
        success: true,
        channel,
        total_parsed: records.length + skipped + emptySkuSkipped,
        records_created: created,
        duplicates_skipped: skipped,
        empty_sku_skipped: emptySkuSkipped
    });
});