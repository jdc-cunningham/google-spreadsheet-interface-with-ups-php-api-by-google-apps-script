<?php

  require(dirname(__FILE__) . DIRECTORY_SEPARATOR . 'env-parser.php');

  if ($_SERVER['REQUEST_METHOD'] == 'GET') {
    $env_vars = getEnvVars();

    // check for API key
    $valid_api_keys = explode(',', $env_vars['VALID_API_KEYS']);
    if (!$_GET['apiKey'] || !in_array($_GET['apiKey'], $valid_api_keys)) {
      echo json_encode([
        "success" => false,
        "message"  => 'invalid api key',
        "range" => $_GET['range']
      ]);
    }

    $access = $env_vars["UPS_ACCESS_KEY"];
    $userid = $env_vars["UPS_USER_NAME"];
    $passwd = $env_vars["UPS_PASSWORD"];

    // $endpointurl = "https://wwwcie.ups.com/ups.app/xml/Rate";
    // $endpointurl = 'https://onlinetools.ups.com/webservices/Rate';
    $endpointurl = "https://onlinetools.ups.com/ups.app/xml/Rate";

    function getDimensionsComponents($dimensionsStr) {
      if (strlen($dimensionsStr) > 0) { // even empty still matches
        $dimensions = explode('x', $dimensionsStr);
      } else {
        $dimensions = [
          1,
          1,
          1
        ];
      }
      return [
        'length' => $dimensions[0],
        'width' => $dimensions[1],
        'height' => $dimensions[2]
      ];
    }

    // sample payload array
    if (!$_GET["zipFrom"]) { // if at least one missing invalid
      echo json_encode([
        "range" => $_GET['range'],
        "success" => false,
        "message"  => "invalid local request" // before ups
      ]);
    }

    $dimensions = getDimensionsComponents($_GET['dimensions']);

    $payload_array = [
      "shippingInfo" => [
        "shippingFrom" => [
          "zipcode" => $_GET["zipFrom"],
        ],
        "shippingTo" => [
          "zipcode" => $_GET["zipTo"],
        ],
      ],
      "packageInfo" => [
        "dimensions" => $dimensions,
        "weight" => $_GET["weight"]
      ]
    ];
    
    try {
      // create a simple xml object for AccessRequest & RateRequest
      $accessRequesttXML = new SimpleXMLElement ( "<AccessRequest></AccessRequest>" );
      $rateRequestXML = new SimpleXMLElement ( "<RatingServiceSelectionRequest></RatingServiceSelectionRequest>" );
      
      // create AccessRequest XML
      $accessRequesttXML->addChild ( "AccessLicenseNumber", $access );
      $accessRequesttXML->addChild ( "UserId", $userid );
      $accessRequesttXML->addChild ( "Password", $passwd );
      
      // create RateRequest XML
      $request = $rateRequestXML->addChild ( 'Request' );
      $request->addChild ( "RequestAction", "Rate" );
      $request->addChild ( "RequestOption", "Rate" );
      
      $request = $rateRequestXML->addChild ( 'PickupType' );
      $request->addChild( "Code", "03" );
      
      $shipment = $rateRequestXML->addChild ( 'Shipment' );
      $shipper = $shipment->addChild ( 'Shipper' );
      $shipperAddress = $shipper->addChild ( 'Address' );
      $shipperAddress->addChild ( "PostalCode", $payload_array["shippingInfo"]["shippingFrom"]["zipcode"] );
      $shipperAddress->addChild ( "CountryCode", "US" );
      
      $shipTo = $shipment->addChild ( 'ShipTo' );
      $shipToAddress = $shipTo->addChild ( 'Address' );
      $shipToAddress->addChild ( "PostalCode", $payload_array["shippingInfo"]["shippingFrom"]["zipcode"] );
      $shipToAddress->addChild ( "CountryCode", "US" );
      
      $shipFrom = $shipment->addChild ( 'ShipFrom' );
      $shipFromAddress = $shipFrom->addChild ( 'Address' );
      $shipFromAddress->addChild ( "PostalCode", $payload_array["shippingInfo"]["shippingTo"]["zipcode"] );
      $shipFromAddress->addChild ( "CountryCode", "US" );
      
      $service = $shipment->addChild ( 'Service' );
      $service->addChild ( "Code", "03" );
      $service->addChild ( "Description", "UPS Ground" );
      
      $package = $shipment->addChild ( 'Package' );
      $packageType = $package->addChild ( 'PackagingType' );
      $packageType->addChild ( "Code", "02" );
      $packageType->addChild ( "Description", "UPS Package" );
      
      $packageWeight = $package->addChild ( 'PackageWeight' );
      $unitOfMeasurement = $packageWeight->addChild ( 'UnitOfMeasurement' );
      $unitOfMeasurement->addChild ( "Code", "LBS" );
      $packageWeight->addChild ( "Weight", $payload_array["packageInfo"]["weight"] );
      
      $packageDimensions = $package->addChild( 'Dimensions' );
      $unitOfMeasurement = $packageDimensions->addChild( 'UnitOfMeasurement' );
      $unitOfMeasurement->addChild( "Code", "IN" );
      $packageDimensions->addChild( "Length", $payload_array["packageInfo"]["dimensions"]["length"] );
      $packageDimensions->addChild( "Width", $payload_array["packageInfo"]["dimensions"]["width"] );
      $packageDimensions->addChild( "Height", $payload_array["packageInfo"]["dimensions"]["height"] );

      $addressType = $shipment->addChild( 'AddressType' );
      $addressType->addChild( 'ResidentialAddressIndicator', "1" );
    
      $requestXML = $accessRequesttXML->asXML () . $rateRequestXML->asXML ();
    
      // create Post request
      $form = array (
        'http' => array (
          'method' => 'POST',
          'header' => 'Content-type: application/x-www-form-urlencoded',
          'content' => "$requestXML" 
        ) 
      );
      
      $request = stream_context_create ( $form );
      $browser = fopen ( $endpointurl, 'rb', false, $request );
      if (! $browser) {
        throw new Exception ( "Connection failed." );
      }
      
      // get response
      $response = stream_get_contents ( $browser );
      fclose ( $browser );
      
      if ($response == false) {
        throw new Exception ( "Bad data." );
      } else {
        // to json
        $xml = simplexml_load_string($response);
        $rates = json_decode(json_encode($xml), TRUE);

        if ($rates['Response']['ResponseStatusCode'] === "1") {
          $rate = $rates['RatedShipment']['TotalCharges']['MonetaryValue'];
        } else {
          $rate = false;
        }

        echo json_encode([
          "success" => true,
          "rate" => $rate,
          "range" => $_GET['range'] // for figuring out what cell to paste value into on spreadsheet
        ]);
      }
    } catch ( Exception $ex ) {
      echo json_encode([
        "success" => false,
        "message"  => $ex,
        "range" => $_GET['range']
      ]);
    }

  }
