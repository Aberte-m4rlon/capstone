$svc = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzb3RseGJ2YW5wd2VuZmd0ZmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njc1NjQwNSwiZXhwIjoyMTAyMzMyNDA1fQ.0goX9ebXlpmGpcHz9aNU0EHlnOGd9M7oAMnJS5BGnyU"
$uid = "d586af66-5435-4d29-b727-d93d3a9ab479"
$url = "https://bsotlxbvanpwengftfli.supabase.co/rest/v1"


function Post($table, $json) {
    $r = curl.exe -s -o nul -w "%{http_code}" -X POST "$url/$table" `
        -H "apikey: $svc" -H "Authorization: Bearer $svc" `
        -H "Content-Type: application/json" -H "Prefer: return=minimal" `
        --data-raw $json
    return $r
}

$ids = @{
    Rosa  = "f01900fd-9921-454c-a3b7-fb58f0332208"
    Bruno = "47945bd2-dcb2-4a72-94d0-b04ffe9cf473"
    Luna  = "d2b01589-814e-463b-af28-253e19dc462a"
    Pedro = "cc1749be-6de8-40d5-8d79-dae0e64383db"
    Nena  = "50d0e6f7-fa43-4758-9d8d-2c7b78ce017b"
    Tomas = "76df19ee-b5f6-4f45-83ef-49c32768e094"
    Clara = "5a3a3e83-2ccd-4089-bf73-283da39bf35b"
    Marco = "d1565613-d03d-49df-b8eb-b92e47250e7f"
    Sofia = "e04074b0-25e4-4bdc-bcef-e691987ba614"
    Diego = "525bc9ee-3af1-4eeb-99c9-141f10838def"
}

Write-Host "--- Weight Records ---"
$wdata = @(
    @{u=$uid;a=$ids.Rosa; d="2026-05-01";w=28.0}, @{u=$uid;a=$ids.Rosa; d="2026-06-01";w=30.2}, @{u=$uid;a=$ids.Rosa; d="2026-07-01";w=32.5},
    @{u=$uid;a=$ids.Bruno;d="2026-05-01";w=40.0}, @{u=$uid;a=$ids.Bruno;d="2026-06-01";w=42.5}, @{u=$uid;a=$ids.Bruno;d="2026-07-01";w=45.0},
    @{u=$uid;a=$ids.Luna; d="2026-05-01";w=18.0}, @{u=$uid;a=$ids.Luna; d="2026-06-01";w=20.0}, @{u=$uid;a=$ids.Luna; d="2026-07-01";w=22.0},
    @{u=$uid;a=$ids.Pedro;d="2026-05-01";w=24.0}, @{u=$uid;a=$ids.Pedro;d="2026-06-01";w=26.0}, @{u=$uid;a=$ids.Pedro;d="2026-07-01";w=28.0},
    @{u=$uid;a=$ids.Nena; d="2026-05-01";w=34.0}, @{u=$uid;a=$ids.Nena; d="2026-06-01";w=36.0}, @{u=$uid;a=$ids.Nena; d="2026-07-01";w=38.0},
    @{u=$uid;a=$ids.Tomas;d="2026-05-01";w=46.0}, @{u=$uid;a=$ids.Tomas;d="2026-06-01";w=49.0}, @{u=$uid;a=$ids.Tomas;d="2026-07-01";w=52.0},
    @{u=$uid;a=$ids.Clara;d="2026-05-01";w=34.0}, @{u=$uid;a=$ids.Clara;d="2026-06-01";w=32.0}, @{u=$uid;a=$ids.Clara;d="2026-07-01";w=30.0},
    @{u=$uid;a=$ids.Marco;d="2026-05-01";w=15.0}, @{u=$uid;a=$ids.Marco;d="2026-06-01";w=16.8}, @{u=$uid;a=$ids.Marco;d="2026-07-01";w=18.5},
    @{u=$uid;a=$ids.Sofia;d="2026-05-01";w=37.0}, @{u=$uid;a=$ids.Sofia;d="2026-06-01";w=39.0}, @{u=$uid;a=$ids.Sofia;d="2026-07-01";w=41.0},
    @{u=$uid;a=$ids.Diego;d="2026-05-01";w=58.0}, @{u=$uid;a=$ids.Diego;d="2026-06-01";w=56.5}, @{u=$uid;a=$ids.Diego;d="2026-07-01";w=55.0}
)
$wok = 0
foreach ($r in $wdata) {
    $j = "{`"user_id`":`"$($r.u)`",`"animal_id`":`"$($r.a)`",`"record_date`":`"$($r.d)`",`"weight_kg`":$($r.w)}"
    $s = Post "weight_records" $j
    if ($s -eq "201") { $wok++ }
}
Write-Host "Weight: $wok/$($wdata.Count)"

Write-Host "--- Vaccinations ---"
$vaccs = @(
    @{a=$ids.Rosa; n="PPR Vaccine"; d="2026-05-10"; nd="2026-11-10"; v="Dr. Santos"},
    @{a=$ids.Bruno;n="CD&T Vaccine";d="2026-04-15";nd="2026-10-15";v="Dr. Reyes"},
    @{a=$ids.Luna; n="FMD Vaccine"; d="2026-03-01"; nd="2026-06-01"; v="DA-BAI"},
    @{a=$ids.Pedro;n="PPR Vaccine"; d="2026-05-20"; nd="2026-11-20"; v="Dr. Santos"},
    @{a=$ids.Nena; n="CD&T Vaccine";d="2026-06-01"; nd="2026-12-01"; v="Dr. Cruz"},
    @{a=$ids.Tomas;n="PPR Vaccine"; d="2026-06-10"; nd="2026-12-10"; v="Dr. Cruz"},
    @{a=$ids.Sofia;n="FMD Vaccine"; d="2026-05-05"; nd="2026-08-05"; v="DA-BAI"},
    @{a=$ids.Marco;n="Albendazole (Dewormer)";d="2026-06-15";nd="2026-09-15";v="Dr. Reyes"}
)
$vok = 0
foreach ($r in $vaccs) {
    $j = "{`"user_id`":`"$uid`",`"animal_id`":`"$($r.a)`",`"vaccine_name`":`"$($r.n)`",`"date_given`":`"$($r.d)`",`"next_due_date`":`"$($r.nd)`",`"veterinarian`":`"$($r.v)`"}"
    $s = Post "vaccinations" $j
    if ($s -eq "201") { $vok++ }
}
Write-Host "Vaccinations: $vok/$($vaccs.Count)"

Write-Host "--- Breeding Records ---"
$breeds = @(
    @{a=$ids.Nena; p=$ids.Tomas;m="2026-03-01";k="2026-07-29";st="Pregnant"},
    @{a=$ids.Rosa; p=$ids.Bruno;m="2026-01-15";k="2026-06-14";st="Kidded"},
    @{a=$ids.Sofia;p=$ids.Bruno;m="2026-05-01";k="2026-09-28";st="Pregnant"},
    @{a=$ids.Luna; p=$ids.Pedro;m="2025-12-01";k="2026-04-30";st="Kidded"},
    @{a=$ids.Clara;p=$ids.Diego;m="2025-11-01";k="2026-03-31";st="Failed"}
)
$bok = 0
foreach ($r in $breeds) {
    $j = "{`"user_id`":`"$uid`",`"animal_id`":`"$($r.a)`",`"partner_id`":`"$($r.p)`",`"mating_date`":`"$($r.m)`",`"expected_kidding_date`":`"$($r.k)`",`"status`":`"$($r.st)`"}"
    $s = Post "breeding_records" $j
    if ($s -eq "201") { $bok++ }
}
Write-Host "Breeding: $bok/$($breeds.Count)"

Write-Host "--- Feed Records ---"
$feeds = @(
    @{a=$ids.Rosa; d="2026-07-01";f="Napier Grass (Penisetum purpureum)";q=3.5;c=52.50},
    @{a=$ids.Rosa; d="2026-07-08";f="Rice Bran";q=0.5;c=15.00},
    @{a=$ids.Bruno;d="2026-07-01";f="Napier Grass (Penisetum purpureum)";q=5.0;c=75.00},
    @{a=$ids.Bruno;d="2026-07-08";f="Commercial Goat Pellets";q=1.0;c=80.00},
    @{a=$ids.Luna; d="2026-07-01";f="Napier Grass (Penisetum purpureum)";q=2.5;c=37.50},
    @{a=$ids.Nena; d="2026-07-01";f="Napier Grass (Penisetum purpureum)";q=4.0;c=60.00},
    @{a=$ids.Nena; d="2026-07-08";f="Corn Grits / Ground Corn";q=0.5;c=20.00},
    @{a=$ids.Tomas;d="2026-07-01";f="Napier Grass (Penisetum purpureum)";q=5.5;c=82.50},
    @{a=$ids.Sofia;d="2026-07-01";f="Napier Grass (Penisetum purpureum)";q=4.5;c=67.50},
    @{a=$ids.Diego;d="2026-07-01";f="Napier Grass (Penisetum purpureum)";q=4.0;c=60.00}
)
$fok = 0
foreach ($r in $feeds) {
    $j = "{`"user_id`":`"$uid`",`"animal_id`":`"$($r.a)`",`"record_date`":`"$($r.d)`",`"feed_type`":`"$($r.f)`",`"quantity_kg`":$($r.q),`"cost`":$($r.c)}"
    $s = Post "feed_records" $j
    if ($s -eq "201") { $fok++ }
}
Write-Host "Feed: $fok/$($feeds.Count)"

Write-Host "--- Milk Records (for Holt forecast) ---"
$milks = @(
    @{a=$ids.Rosa; d="2026-07-01";y=1.2}, @{a=$ids.Rosa; d="2026-07-02";y=1.3}, @{a=$ids.Rosa; d="2026-07-03";y=1.1},
    @{a=$ids.Rosa; d="2026-07-04";y=1.4}, @{a=$ids.Rosa; d="2026-07-05";y=1.3}, @{a=$ids.Rosa; d="2026-07-06";y=1.5},
    @{a=$ids.Rosa; d="2026-07-07";y=1.4},
    @{a=$ids.Nena; d="2026-07-01";y=0.9}, @{a=$ids.Nena; d="2026-07-02";y=1.0}, @{a=$ids.Nena; d="2026-07-03";y=0.8},
    @{a=$ids.Nena; d="2026-07-04";y=1.1}, @{a=$ids.Nena; d="2026-07-05";y=1.0}, @{a=$ids.Nena; d="2026-07-06";y=1.2},
    @{a=$ids.Nena; d="2026-07-07";y=1.1},
    @{a=$ids.Sofia;d="2026-07-01";y=1.5}, @{a=$ids.Sofia;d="2026-07-02";y=1.6}, @{a=$ids.Sofia;d="2026-07-03";y=1.4},
    @{a=$ids.Sofia;d="2026-07-04";y=1.7}, @{a=$ids.Sofia;d="2026-07-05";y=1.6}, @{a=$ids.Sofia;d="2026-07-06";y=1.8},
    @{a=$ids.Sofia;d="2026-07-07";y=1.7}
)
$mok = 0
foreach ($r in $milks) {
    $j = "{`"user_id`":`"$uid`",`"animal_id`":`"$($r.a)`",`"record_date`":`"$($r.d)`",`"yield_litres`":$($r.y)}"
    $s = Post "milk_records" $j
    if ($s -eq "201") { $mok++ }
}
Write-Host "Milk: $mok/$($milks.Count)"

Write-Host "--- Inventory ---"
$inv = @(
    @{n="Napier Grass";c="Feed";q=200;u="kg";m=50;cost=3.00},
    @{n="Rice Bran";c="Feed";q=50;u="kg";m=20;cost=18.00},
    @{n="Commercial Goat Pellets";c="Feed";q=25;u="kg";m=10;cost=75.00},
    @{n="PPR Vaccine";c="Vaccines";q=20;u="vials";m=5;cost=150.00},
    @{n="Albendazole (Dewormer)";c="Medicine";q=30;u="tablets";m=10;cost=8.50},
    @{n="Oxytetracycline (Antibiotic)";c="Medicine";q=10;u="vials";m=3;cost=95.00},
    @{n="Syringe (10 mL)";c="Supplies";q=50;u="pcs";m=20;cost=5.00},
    @{n="Ear Tags";c="Supplies";q=100;u="pcs";m=30;cost=12.00}
)
$iok = 0
foreach ($r in $inv) {
    $j = "{`"user_id`":`"$uid`",`"name`":`"$($r.n)`",`"category`":`"$($r.c)`",`"quantity`":$($r.q),`"unit`":`"$($r.u)`",`"minimum_stock`":$($r.m),`"cost`":$($r.cost)}"
    $s = Post "inventory" $j
    if ($s -eq "201") { $iok++ }
}
Write-Host "Inventory: $iok/$($inv.Count)"

Write-Host "=== SEED COMPLETE ==="
