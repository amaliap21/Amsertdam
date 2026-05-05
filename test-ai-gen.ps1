$filePath = 'biology-test.txt'
$fileStream = [System.IO.File]::OpenRead($filePath)
$multipartContent = New-Object System.Net.Http.MultipartFormDataContent
$fileContent = New-Object System.Net.Http.StreamContent($fileStream)
$fileContent.Headers.ContentDisposition = New-Object System.Net.Http.Headers.ContentDispositionHeaderValue('form-data')
$fileContent.Headers.ContentDisposition.FileName = $filePath
$fileContent.Headers.ContentDisposition.Name = 'file'
$multipartContent.Add($fileContent)
$deckNameContent = New-Object System.Net.Http.StringContent('Biology 101')
$deckNameContent.Headers.ContentDisposition = New-Object System.Net.Http.Headers.ContentDispositionHeaderValue('form-data')
$deckNameContent.Headers.ContentDisposition.Name = 'deckName'
$multipartContent.Add($deckNameContent)
$httpClient = New-Object System.Net.Http.HttpClient
$response = $httpClient.PostAsync('http://localhost:3000/api/ai/flashcards/generate', $multipartContent).Result
Write-Output $response.Content.ReadAsStringAsync().Result
$fileStream.Close()
