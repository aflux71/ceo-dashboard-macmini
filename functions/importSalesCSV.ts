import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { file_url, channel } = await req.json();
    // channel: "online" or "pos"

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

    // Parse CSV rows (handle quoted fields)
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

    // First, load existing records for 2025 to deduplicate
    // We'll deduplicate by sku + day + channel (since CSV is aggregated daily)
    // Build a set of "sku|day|channel|location" keys from existing records
    console.log('Loading existing records for dedup...');
    const existingKeys = new Set();
    let skip = 0;
    const batchSize = 500;
    while (true) {
        const batch = await base44.asServiceRole.entities.ShopifySaleRecord.list('-created_date', batchSize, skip);
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
    }
    console.log(`Loaded ${existingKeys.size} existing 2025 dedup keys`);

    // Parse rows and create records
    const records = [];
    let skipped = 0;
    let emptySkuSkipped = 0;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const fields = parseCSVLine(line);

        let sku, productName, day, qty, totalSales, locationName;

        if (channel === 'pos') {
            // POS: POS location name, Product title, Product variant SKU, Day, Quantity ordered, Total sales
            locationName = fields[0] || '';
            productName = fields[1] || '';
            sku = fields[2] || '';
            day = fields[3] || '';
            qty = parseInt(fields[4]) || 0;
            totalSales = parseFloat(fields[5]) || 0;
        } else {
            // Online: Product title, Product variant SKU, Day, Quantity ordered, Total sales
            productName = fields[0] || '';
            sku = fields[1] || '';
            day = fields[2] || '';
            qty = parseInt(fields[3]) || 0;
            totalSales = parseFloat(fields[4]) || 0;
            locationName = '';
        }

        // Skip empty SKUs
        if (!sku) {
            emptySkuSkipped++;
            continue;
        }

        // Skip if qty is 0 or negative (returns)
        if (qty <= 0) {
            skipped++;
            continue;
        }

        // Check dedup
        const dedupKey = `${sku}|${day}|${channel}|${locationName}`;
        if (existingKeys.has(dedupKey)) {
            skipped++;
            continue;
        }

        // Use a synthetic order_id based on CSV data since we don't have real order IDs
        const orderId = `CSV-${channel}-${sku}-${day}-${locationName || 'online'}`;

        records.push({
            order_id: orderId,
            sku: sku,
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

    // Bulk insert in batches of 100
    let created = 0;
    for (let i = 0; i < records.length; i += 100) {
        const batch = records.slice(i, i + 100);
        await base44.asServiceRole.entities.ShopifySaleRecord.bulkCreate(batch);
        created += batch.length;
        console.log(`Created ${created}/${records.length}`);
    }

    // Log sync
    await base44.asServiceRole.entities.SyncLog.create({
        sync_type: 'shopify_orders',
        status: 'success',
        records_processed: records.length + skipped + emptySkuSkipped,
        records_created: created,
        triggered_by: user.email,
        notes: `CSV import: ${channel} channel, ${created} records created, ${skipped} dupes skipped, ${emptySkuSkipped} empty SKUs skipped`,
        date_range_start: '2025-01-01',
        date_range_end: '2025-12-31'
    });

    return Response.json({
        success: true,
        channel,
        total_parsed: records.length + skipped + emptySkuSkipped,
        records_created: created,
        duplicates_skipped: skipped,
        empty_sku_skipped: emptySkuSkipped
    });
});