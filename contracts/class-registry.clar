(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_NOT_AUTHORIZED (err u100))
(define-constant ERR_CLASS_NOT_FOUND (err u101))
(define-constant ERR_INVALID_PRICE (err u102))
(define-constant ERR_INVALID_DURATION (err u103))
(define-constant ERR_INVALID_TITLE (err u104))
(define-constant ERR_INVALID_START_TIME (err u105))
(define-constant ERR_CLASS_INACTIVE (err u106))
(define-constant ERR_MAX_CLASSES_EXCEEDED (err u107))
(define-constant ERR_INVALID_CAPACITY (err u108))
(define-constant ERR_DUPLICATE_CLASS (err u109))
(define-constant ERR_UPDATE_NOT_ALLOWED (err u110))
(define-constant ERR_INVALID_STATUS (err u111))
(define-constant ERR_PAST_START_TIME (err u112))
(define-constant ERR_NOT_INSTRUCTOR (err u113))
(define-constant ERR_MAX_REGISTRATIONS (err u114))
(define-constant MAX_CLASSES u1000)
(define-constant MAX_TITLE_LENGTH u100)
(define-constant MAX_DESCRIPTION_LENGTH u500)
(define-data-var next-class-id uint u0)
(define-data-var max-classes uint MAX_CLASSES)
(define-data-var platform-fee-recipient principal 'SP000000000000000000002Q6VF78)
(define-map Classes
  { class-id: uint }
  { title: (string-utf8 MAX_TITLE_LENGTH),
    description: (string-utf8 MAX_DESCRIPTION_LENGTH),
    instructor: principal,
    price: uint,
    duration: uint,
    start-time: uint,
    capacity: uint,
    registered-count: uint,
    active: bool,
    created-at: uint,
    updated-at: uint })
(define-map ClassesByInstructor
  { instructor: principal }
  (list 200 uint))
(define-map ActiveClassIds (list 1000 uint))
(define-read-only (get-class (class-id uint))
  (map-get? Classes { class-id: class-id }))
(define-read-only (get-classes-by-instructor (instructor principal))
  (default-to (list) (map-get? ClassesByInstructor { instructor: instructor })))
(define-read-only (get-active-class-ids)
  (var-get ActiveClassIds))
(define-read-only (get-next-class-id)
  (ok (var-get next-class-id)))
(define-read-only (get-total-classes)
  (ok (var-get next-class-id)))
(define-private (validate-title (title (string-utf8 MAX_TITLE_LENGTH)))
  (if (and (> (len title) u0) (<= (len title) MAX_TITLE_LENGTH)) (ok true) (err ERR_INVALID_TITLE)))
(define-private (validate-description (desc (string-utf8 MAX_DESCRIPTION_LENGTH)))
  (if (<= (len desc) MAX_DESCRIPTION_LENGTH) (ok true) (err ERR_INVALID_DESCRIPTION)))
(define-private (validate-price (price uint))
  (if (> price u0) (ok true) (err ERR_INVALID_PRICE)))
(define-private (validate-duration (duration uint))
  (if (> duration u0) (ok true) (err ERR_INVALID_DURATION)))
(define-private (validate-start-time (start-time uint))
  (if (>= start-time block-height) (ok true) (err ERR_INVALID_START_TIME)))
(define-private (validate-capacity (capacity uint))
  (if (and (> capacity u0) (<= capacity u500)) (ok true) (err ERR_INVALID_CAPACITY)))
(define-private (validate-not-past-start (start-time uint))
  (if (>= start-time block-height) (ok true) (err ERR_PAST_START_TIME)))
(define-public (set-platform-fee-recipient (new-recipient principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) (err ERR_NOT_AUTHORIZED))
    (var-set platform-fee-recipient new-recipient)
    (ok true)))
(define-public (create-class
  (title (string-utf8 MAX_TITLE_LENGTH))
  (description (string-utf8 MAX_DESCRIPTION_LENGTH))
  (price uint)
  (duration uint)
  (start-time uint)
  (capacity uint))
  (let ((class-id (var-get next-class-id))
        (current-max (var-get max-classes))
        (instructor-classes (get-classes-by-instructor tx-sender)))
    (asserts! (< class-id current-max) (err ERR_MAX_CLASSES_EXCEEDED))
    (try! (validate-title title))
    (try! (validate-description description))
    (try! (validate-price price))
    (try! (validate-duration duration))
    (try! (validate-start-time start-time))
    (try! (validate-capacity capacity))
    (map-set Classes { class-id: class-id }
      { title: title,
        description: description,
        instructor: tx-sender,
        price: price,
        duration: duration,
        start-time: start-time,
        capacity: capacity,
        registered-count: u0,
        active: true,
        created-at: block-height,
        updated-at: block-height })
    (map-set ClassesByInstructor { instructor: tx-sender }
      (unwrap! (as-max-len? (append instructor-classes class-id) u200) (err ERR_MAX_REGISTRATIONS)))
    (var-set ActiveClassIds (unwrap! (as-max-len? (append (var-get ActiveClassIds) class-id) u1000) (err ERR_MAX_CLASSES_EXCEEDED)))
    (var-set next-class-id (+ class-id u1))
    (print { event: "class-created", class-id: class-id, instructor: tx-sender })
    (ok class-id)))
(define-public (update-class
  (class-id uint)
  (title (string-utf8 MAX_TITLE_LENGTH))
  (description (string-utf8 MAX_DESCRIPTION_LENGTH))
  (price uint)
  (duration uint)
  (capacity uint))
  (let ((class (unwrap! (map-get? Classes { class-id: class-id }) (err ERR_CLASS_NOT_FOUND)))
        (start-time (get start-time class)))
    (asserts! (is-eq (get instructor class) tx-sender) (err ERR_NOT_INSTRUCTOR))
    (asserts! (get active class) (err ERR_CLASS_INACTIVE))
    (try! (validate-not-past-start start-time))
    (try! (validate-title title))
    (try! (validate-description description))
    (try! (validate-price price))
    (try! (validate-duration duration))
    (try! (validate-capacity capacity))
    (map-set Classes { class-id: class-id }
      (merge class
        { title: title,
          description: description,
          price: price,
          duration: duration,
          capacity: capacity,
          updated-at: block-height }))
    (print { event: "class-updated", class-id: class-id })
    (ok true)))
(define-public (cancel-class (class-id uint))
  (let ((class (unwrap! (map-get? Classes { class-id: class-id }) (err ERR_CLASS_NOT_FOUND))))
    (asserts! (is-eq (get instructor class) tx-sender) (err ERR_NOT_INSTRUCTOR))
    (asserts! (get active class) (err ERR_INVALID_STATUS))
    (map-set Classes { class-id: class-id } (merge class { active: false, updated-at: block-height }))
    (var-set ActiveClassIds (filter is-not-class-id (var-get ActiveClassIds)))
    (print { event: "class-cancelled", class-id: class-id })
    (ok true)))
(define-private (is-not-class-id (id uint))
  (not (is-eq id (var-get next-class-id))))
(define-public (increment-registered-count (class-id uint))
  (let ((class (unwrap! (map-get? Classes { class-id: class-id }) (err ERR_CLASS_NOT_FOUND))))
    (asserts! (get active class) (err ERR_CLASS_INACTIVE))
    (asserts! (< (get registered-count class) (get capacity class)) (err ERR_MAX_REGISTRATIONS))
    (map-set Classes { class-id: class-id }
      (merge class { registered-count: (+ (get registered-count class) u1) }))
    (ok true)))