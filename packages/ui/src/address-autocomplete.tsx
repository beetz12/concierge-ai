"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

const libraries: ("places")[] = ["places"];
// 2025 API uses these field names
const PLACE_FIELDS = ["addressComponents", "formattedAddress", "id"] as const;

export interface AddressComponents {
  formatted: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  placeId?: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: AddressComponents) => void;
  onInputChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  apiKey?: string;
}

// Type for the 2025 gmp-select event
interface PlaceSelectEvent extends Event {
  placePrediction?: {
    toPlace: () => google.maps.places.Place;
  };
  // Fallback for older API versions
  place?: google.maps.places.Place;
}

// Extended PlacesLibrary type for 2025 API - includes PlaceAutocompleteElement
// The @types/google.maps package may not include this newer API
interface ExtendedPlacesLibrary extends google.maps.PlacesLibrary {
  PlaceAutocompleteElement: new (options?: {
    componentRestrictions?: { country: string | string[] };
    types?: string[];
  }) => google.maps.places.PlaceAutocompleteElement;
}

export function AddressAutocomplete({
  value,
  onChange,
  onInputChange,
  placeholder = "Enter your address",
  className = "",
  required = false,
  apiKey,
}: AddressAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const autocompleteElementRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [initError, setInitError] = useState(false);

  // Refs to store latest callbacks - prevents useEffect from re-running when callbacks change
  const onChangeRef = useRef(onChange);
  const onInputChangeRef = useRef(onInputChange);

  const googleMapsApiKey = apiKey || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || "";

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey,
    libraries,
    version: "beta",
  });

  // Keep refs updated with latest callbacks
  useEffect(() => {
    onChangeRef.current = onChange;
    onInputChangeRef.current = onInputChange;
  }, [onChange, onInputChange]);

  const handlePlaceSelect = useCallback(
    async (event: Event) => {
      const placeEvent = event as PlaceSelectEvent;

      // 2025 API: gmp-select provides placePrediction, need to call toPlace()
      // Fallback: older API provides place directly
      let place: google.maps.places.Place | null = null;

      if (placeEvent.placePrediction) {
        // New 2025 API pattern
        place = placeEvent.placePrediction.toPlace();
      } else if (placeEvent.place) {
        // Fallback for older API
        place = placeEvent.place;
      }

      if (!place) {
        console.warn("No place found in event", placeEvent);
        return;
      }

      try {
        // fetchFields populates the place object with requested fields
        await place.fetchFields({ fields: PLACE_FIELDS as unknown as string[] });
        const components = place.addressComponents || [];

        const getComponent = (type: string) => components.find(component => component.types.includes(type));
        const streetNumber = getComponent("street_number")?.longText || "";
        const route = getComponent("route")?.longText || "";
        const city =
          getComponent("locality")?.longText ||
          getComponent("sublocality")?.longText ||
          getComponent("administrative_area_level_2")?.longText ||
          "";
        const state = getComponent("administrative_area_level_1")?.shortText || "";
        const zip = getComponent("postal_code")?.longText || "";
        const formatted = place.formattedAddress || "";

        console.log("Address selected:", { formatted, city, state, zip });

        setInputValue(formatted);
        onChangeRef.current({
          formatted,
          street: streetNumber ? `${streetNumber} ${route}` : route,
          city,
          state,
          zip,
          placeId: place.id,
        });

        // Set value in shadow DOM - PlaceAutocompleteElement uses shadow DOM for its internal input
        // We need to access shadowRoot and find the actual input element
        requestAnimationFrame(() => {
          const element = autocompleteElementRef.current;
          if (!element || !formatted) return;

          // Try shadow DOM first (2025 best practice for web components)
          const shadowRoot = element.shadowRoot;
          if (shadowRoot) {
            const innerInput = shadowRoot.querySelector('input');
            if (innerInput) {
              innerInput.value = formatted;
              // Dispatch events to ensure component state is updated
              innerInput.dispatchEvent(new Event('input', { bubbles: true }));
              innerInput.dispatchEvent(new Event('change', { bubbles: true }));
              return;
            }
          }

          // Fallback: try setting value directly on element
          (element as HTMLElement & { value?: string }).value = formatted;
        });
      } catch (error) {
        console.error("Failed to fetch place details", error);
      }
    },
    [],
  );

  const handleInputChange = useCallback(
    (event: Event) => {
      const target = event.target as
        | (google.maps.places.PlaceAutocompleteElement & { value?: string })
        | HTMLInputElement
        | null;
      const newValue = target?.value ?? autocompleteElementRef.current?.getAttribute("value") ?? "";
      setInputValue(newValue);
      onInputChangeRef.current?.(newValue);
    },
    [],
  );

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    if (!isLoaded || !containerRef.current || autocompleteElementRef.current) return;

    let isMounted = true;

    const initAutocomplete = async () => {
      try {
        const { PlaceAutocompleteElement } = (await google.maps.importLibrary("places")) as ExtendedPlacesLibrary;
        if (!isMounted) return;

        const element = new PlaceAutocompleteElement({
          componentRestrictions: { country: ["us"] },
          types: ["address"],
        });

        element.style.display = "block";
        element.style.width = "100%";

        // 2025 API uses gmp-select event, fallback to gmp-placeselect for compatibility
        element.addEventListener("gmp-select", handlePlaceSelect as EventListener);
        element.addEventListener("gmp-placeselect", handlePlaceSelect as EventListener);
        element.addEventListener("input", handleInputChange as EventListener);

        containerRef.current?.appendChild(element);
        autocompleteElementRef.current = element;
      } catch (error) {
        console.error("Failed to initialize PlaceAutocompleteElement", error);
        setInitError(true);
      }
    };

    void initAutocomplete();

    return () => {
      isMounted = false;
      const element = autocompleteElementRef.current;
      if (element) {
        element.removeEventListener("gmp-select", handlePlaceSelect as EventListener);
        element.removeEventListener("gmp-placeselect", handlePlaceSelect as EventListener);
        element.removeEventListener("input", handleInputChange as EventListener);
        element.remove();
        autocompleteElementRef.current = null;
      }
    };
  }, [isLoaded]);

  useEffect(() => {
    const element = autocompleteElementRef.current as
      | (google.maps.places.PlaceAutocompleteElement & { value?: string })
      | null;

    if (!element) return;

    if (element.value !== undefined && element.value !== inputValue) {
      element.value = inputValue;
    } else if (element.getAttribute("value") !== inputValue) {
      element.setAttribute("value", inputValue);
    }

    element.setAttribute("placeholder", placeholder);
    element.className = className;
    if (required) {
      element.setAttribute("required", "true");
    } else {
      element.removeAttribute("required");
    }
  }, [className, inputValue, placeholder, required]);

  if (loadError || initError) {
    return (
      <input
        type="text"
        value={inputValue}
        onChange={e => handleInputChange(e.nativeEvent)}
        placeholder={placeholder}
        className={className}
        required={required}
      />
    );
  }

  if (!isLoaded) {
    return (
      <input
        type="text"
        value={inputValue}
        onChange={e => handleInputChange(e.nativeEvent)}
        placeholder="Loading..."
        className={className}
        disabled
      />
    );
  }

  return <div ref={containerRef} className={className} />;
}
