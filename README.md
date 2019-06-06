#Walmart Search Code Challenge

The premise behind this code is to not only filter the incomming pages, but
to also re-package them according to the page size specified. This code gives
the ability to navigate backward and forward through the data without requiring
that all of the data be pulled for each navigation. In trade, the `filterData`
from the response of this endpoint should be attached to each subsequent page
request using the same filter. If the filter parameters are altered, then 
`filterData` should be omitted.
