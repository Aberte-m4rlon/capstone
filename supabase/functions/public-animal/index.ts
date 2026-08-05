import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const animalId = url.searchParams.get('id');

    if (!animalId) {
      return new Response(JSON.stringify({ error: 'Missing animal id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: animal, error } = await supabase
      .from('animals')
      .select(`
        id, tag_id, name, species, breed, sex, date_of_birth,
        color_markings, photo_url, weight_kg, health_status,
        health_risk_score, breeding_status, vaccination_status,
        archived, created_at
      `)
      .eq('id', animalId)
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: 'Database error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!animal || animal.archived) {
      return new Response(JSON.stringify({ error: 'Animal not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Return only safe, public fields — no user_id, no internal data
    return new Response(
      JSON.stringify({
        id: animal.id,
        tag_id: animal.tag_id,
        name: animal.name,
        species: animal.species,
        breed: animal.breed,
        sex: animal.sex,
        date_of_birth: animal.date_of_birth,
        color_markings: animal.color_markings,
        photo_url: animal.photo_url,
        weight_kg: animal.weight_kg,
        health_status: animal.health_status,
        health_risk_score: animal.health_risk_score,
        breeding_status: animal.breeding_status,
        vaccination_status: animal.vaccination_status,
        registered_on: animal.created_at,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
