# Campus Photography Marketplace – Initial Build Plan

## Overview
This document outlines a structured, phased approach to building a campus-focused platform that connects students with photographers. The goal is to validate real user behavior and demand before expanding into a full-featured marketplace or managed service model.

The problem being addressed is the fragmented and inefficient process of finding and booking photographers. Currently, discovery relies on word-of-mouth, group chats, and social media, leading to unclear pricing, inconsistent quality, and inefficient coordination.

The strategy is to start with the smallest useful product that improves discovery and clarity, then expand gradually based on real usage.

---

## Core Product Thesis
The initial product is not a full marketplace. It is a discovery and clarity layer that allows users to:
- Quickly find photographers
- Understand their work and pricing
- Contact them directly with minimal friction

The long-term vision is to evolve into a managed marketplace that standardizes quality, pricing, and delivery timelines.

---

## Phase 1: Version 1 (Minimum Viable Product)

### Objective
Create a fast and reliable way for students to discover and contact photographers.

### Scope
The product should include only the following:

- Photographer listings
- Individual photographer profile pages
- Portfolio display (or external links such as Instagram)
- Clear pricing or starting price
- Contact method (phone number or Instagram link)

### Explicitly Excluded Features
The following should NOT be included in Version 1:
- In-app messaging systems
- Payment processing
- Booking or scheduling systems
- File delivery or storage
- Notification systems
- Calendar integrations

These features add complexity without solving the core initial problem.

---

## Phase 2: Supply Acquisition

### Objective
Ensure the platform has enough photographers to be useful at launch.

### Steps
1. Identify 10–20 photographers on campus.
2. Reach out directly and explain the platform value proposition:
   - Increased visibility
   - More consistent bookings
3. Collect the following data:
   - Name
   - Photography type (e.g., graduation, events, portraits)
   - Portfolio (Instagram or other link)
   - Pricing or starting rates
   - Contact method
   - Expected response time

### Key Principle
Supply must exist before demand can be effectively served.

---

## Phase 3: Initial Build

### Objective
Develop a usable product quickly, within a few days.

### Recommended Technical Approach
- Frontend: Simple web interface (React, Next.js, or similar)
- Backend: Minimal or optional initially
- Database: Airtable, Supabase, or static JSON

### Required Features
- Homepage displaying photographer listings
- Ability to click into individual profiles
- Display of:
  - Portfolio
  - Pricing
  - Contact information

### Design Principle
Prioritize speed and usability over completeness and polish.

---

## Phase 4: Launch and Distribution

### Objective
Test real user behavior in a natural environment.

### Steps
1. Share the platform in campus group chats where users typically request photographers.
2. Position it as a faster alternative to asking repeatedly.
3. Observe user behavior without forcing adoption.

### Metrics to Observe
- Number of clicks on the platform
- Number of photographer profile views
- Number of outbound contacts to photographers
- Whether users still rely on group chats

---

## Phase 5: Behavioral Validation

### Objective
Understand whether the product changes user behavior.

### Key Questions
- Do users use the platform instead of group chats?
- Do photographers receive meaningful inquiries?
- Is the process faster or clearer for users?

### Method
Conduct direct follow-up conversations with users and photographers rather than relying on surveys.

---

## Phase 6: Iterative Feature Development

### Objective
Improve the product based on real user feedback.

### Feature Expansion Strategy
Add only one feature at a time based on observed needs.

Examples:

- If users lack trust:
  - Add reviews or verification badges

- If coordination is difficult:
  - Add a simple booking request form

- If pricing is unclear:
  - Introduce standardized packages

### Principle
Features are earned through demonstrated need, not assumed upfront.

---

## Phase 7: Avoiding Premature Complexity

The following systems should be deferred until clear demand exists:

- Payment infrastructure
- File delivery systems
- Calendar synchronization
- Advanced messaging systems
- Automated booking flows

These are only justified once the platform demonstrates consistent usage and repeat behavior.

---

## Phase 8: Path to a Managed Marketplace

### Long-Term Vision
Transition from a simple listing platform to a controlled, high-quality service model.

### Characteristics of This Phase
- Standardized pricing packages
- Guaranteed delivery timelines
- Curated or vetted photographers
- Platform-controlled bookings
- Potential contractor or employment relationships with photographers

### Requirement for Transition
This phase should only be pursued after:
- Consistent demand is observed
- Reliable supply is established
- Clear performance data on photographers is available

---

## Success Criteria for Early Stages

The goal is not a polished product. The goal is proof of behavior.

Indicators of success:
- 10–20 active photographers listed
- 30–50 students using the platform
- Real booking interactions occurring
- Users naturally recommending the platform to others

---

## Final Recommendation

Build the smallest possible product that proves:
- Users will use a centralized platform
- Photographers will engage with it
- Real connections and bookings can occur

Do not optimize for features. Optimize for learning and behavior validation.
