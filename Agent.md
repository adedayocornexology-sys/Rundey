# Rundey — Agent Context File

## What is Rundey?
Rundey is a hyperlocal commerce and rider logistics mobile app 
built with React Native + Expo. It connects customers to local 
businesses and riders for fast delivery within Nigerian cities.
Launch cities: Owo and Akure, Ondo State.

## Current Build Phase
Layer 1 — Local Commerce + Riders (MVP)
Layer 2 and 3 are planned but NOT in scope yet.

## Project Structure
- app/          → screens (Home, BusinessProfile, Cart, OrderTracking)
- components/   → reusable UI components
- lib/          → Supabase client, API helpers, Paystack integration
- assets/       → images, icons, fonts
- constants/    → colors, fonts, app-wide config

## Tech Stack
- Frontend: React Native + Expo
- Backend: Supabase (PostGIS for geolocation, pgvector for AI search)
- Auth: Supabase Auth (phone OTP — no email)
- Payments: Paystack (checkout + Transfer API for rider payouts)
- AI: Claude Haiku via Anthropic API (Layer 2 — not yet in scope)
- Hosting: Railway
- Maps: react-native-maps + Google Maps API

## Database Tables (Layer 1)
- users — id, phone, role (customer/rider/merchant), city
- businesses — id, owner_id, name, category, city, location (PostGIS point), is_open
- products — id, business_id, name, price, image_url
- orders — id, customer_id, business_id, rider_id, status, total, created_at
- order_items — id, order_id, product_id, quantity
- rider_locations — rider_id, lat, lng, updated_at

## User Roles
- Customer: browses businesses, places orders, tracks rider live
- Merchant: manages listings, receives orders, views earnings
- Rider: receives dispatch, navigates to pickup/dropoff, tracks earnings

## City Handling
City is a filter field — not a separate app. User selects Owo or Akure 
at onboarding. All business and rider data is filtered by city field 
in Supabase. New cities are added by extending the city selector.

## Key Rules for the Agent
- Always use phone OTP for auth — never email login
- Use PostGIS point type for all location data — never store lat/lng as plain text
- Rider location updates every 5-10 seconds via Supabase Realtime
- Paystack handles all payments — no direct card handling in app
- Address input must include a map pin drop — do not rely on text addresses alone 
  (Owo/Akure streets are not well mapped on Google)
- Keep Layer 2 (AI) and Layer 3 (anomaly tracking) out of scope 
  until Layer 1 is fully shipped
- All components should be mobile-first — no web assumptions
- Use StyleSheet.create() for all styling — no inline styles

## Naming Conventions
- Screens: PascalCase (HomeScreen, CartScreen)
- Components: PascalCase (BusinessCard, RiderPin)
- Helpers/utils: camelCase (formatPrice, getDistance)
- Constants: UPPER_SNAKE_CASE (PRIMARY_COLOR, BASE_URL)

## Environment Variables Needed
- SUPABASE_URL
- SUPABASE_ANON_KEY
- PAYSTACK_PUBLIC_KEY
- GOOGLE_MAPS_API_KEY
- ANTHROPIC_API_KEY (Layer 2 — not yet active)

## Current Sprint
Setting up Expo scaffold, folder structure, Supabase connection, 
and first screen — Home feed showing local businesses by city.

## Built by
Cornelius Adedayo — MoyaCode, Owo, Ondo State, Nigeria
